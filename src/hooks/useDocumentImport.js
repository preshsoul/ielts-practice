import { useState, useRef, useCallback, useEffect } from "react";
import {
  getCvParseJob,
  getCvParserJobSnapshot,
  parseCvFileWithEdgeFunction,
  waitForCvParseJob,
} from "../services/cvParserClient.js";

const JOB_STORAGE_KEY = "loci.cvDocumentImport";
const MAX_JOB_AGE_MS = 5 * 60 * 1000;

function persistJob(jobId) {
  try {
    sessionStorage.setItem(JOB_STORAGE_KEY, JSON.stringify({ jobId, at: Date.now() }));
  } catch { /* sessionStorage unavailable */ }
}

function clearPersistedJob() {
  try {
    sessionStorage.removeItem(JOB_STORAGE_KEY);
  } catch { /* sessionStorage unavailable */ }
}

function getPersistedJobId() {
  try {
    const raw = sessionStorage.getItem(JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > MAX_JOB_AGE_MS) {
      sessionStorage.removeItem(JOB_STORAGE_KEY);
      return null;
    }
    return parsed.jobId || null;
  } catch {
    return null;
  }
}

/**
 * Single unified hook for CV document import.
 * Uploads the file directly to the Supabase cv-parser Edge Function,
 * polls until complete, and returns the canonical parsed result.
 * Persists the active jobId in sessionStorage so a page refresh
 * during parsing can recover without re-uploading.
 */
export function useDocumentImport({ onComplete } = {}) {
  const [status, setStatus] = useState("idle"); // idle | uploading | processing | completed | failed
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);

  const abortRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasResumedRef = useRef(false);

  // On mount, check sessionStorage for a stale job and resume polling
  useEffect(() => {
    if (hasResumedRef.current) return;
    hasResumedRef.current = true;

    const staleJobId = getPersistedJobId();
    if (!staleJobId) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const resume = async () => {
      try {
        const job = await getCvParseJob(staleJobId);
        if (controller.signal.aborted) return;

        const snapshot = getCvParserJobSnapshot(job);
        setJobId(staleJobId);

        if (snapshot.state === "completed") {
          setStatus("completed");
          setProgress(100);
          setPhase("complete");
          setMessage(snapshot.message || "Document parsed successfully.");
          setResult({
            ...job,
            canonical: job.parsed_candidate_profile || null,
            provenance: job.provenance || null,
            profile: job.profile || {},
          });
          clearPersistedJob();
          return;
        }

        if (snapshot.state === "failed") {
          setStatus("failed");
          setError(snapshot.message || "Parsing failed.");
          setMessage(snapshot.message || "Parsing failed.");
          clearPersistedJob();
          return;
        }

        // Still processing — resume polling
        setStatus("processing");
        setPhase(snapshot.phase || "queued");
        setProgress(snapshot.progress ?? 20);
        setMessage("Resuming document parsing...");

        const completedJob = await waitForCvParseJob(staleJobId, {
          onProgress: (snap) => {
            if (controller.signal.aborted) return;
            setPhase(snap.phase || null);
            setProgress(snap.progress ?? 0);
            if (snap.message) setMessage(snap.message);
          },
        });

        if (controller.signal.aborted) return;

        const finalSnapshot = getCvParserJobSnapshot(completedJob);
        setStatus("completed");
        setProgress(100);
        setPhase("complete");
        setMessage(finalSnapshot.message || "Document parsed successfully.");
        setResult({
          ...completedJob,
          canonical: completedJob.parsed_candidate_profile || null,
          provenance: completedJob.provenance || null,
          profile: completedJob.profile || {},
        });
        clearPersistedJob();

        if (onCompleteRef.current) {
          onCompleteRef.current(null, completedJob);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus("failed");
        setError("Unable to resume the previous parsing job. Please try uploading again.");
        clearPersistedJob();
      }
    };

    resume();

    return () => {
      controller.abort();
    };
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    clearPersistedJob();
    setStatus("idle");
    setProgress(0);
    setPhase(null);
    setMessage("");
    setResult(null);
    setError(null);
    setJobId(null);
  }, []);

  const upload = useCallback(async (file, notes = "") => {
    if (!file) {
      setStatus("failed");
      setError("No file selected.");
      return null;
    }

    reset();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setStatus("uploading");
      setProgress(5);
      setMessage("Uploading your document to the secure parser...");

      const parserResult = await parseCvFileWithEdgeFunction(file, notes);

      if (controller.signal.aborted) return null;

      const initialSnapshot = getCvParserJobSnapshot(parserResult);
      setJobId(initialSnapshot.jobId);

      if (initialSnapshot.state === "processing" && initialSnapshot.jobId) {
        persistJob(initialSnapshot.jobId);
        setStatus("processing");
        setPhase(initialSnapshot.phase || "queued");
        setProgress(initialSnapshot.progress ?? 20);
        setMessage(initialSnapshot.message || "Document received. Parsing in progress...");

        const completedJob = await waitForCvParseJob(initialSnapshot.jobId, {
          onProgress: (snapshot) => {
            if (controller.signal.aborted) return;
            setPhase(snapshot.phase || null);
            setProgress(snapshot.progress ?? 0);
            if (snapshot.message) setMessage(snapshot.message);
          },
        });

        if (controller.signal.aborted) return null;

        clearPersistedJob();
        const finalSnapshot = getCvParserJobSnapshot(completedJob);
        setStatus("completed");
        setProgress(100);
        setPhase("complete");
        setMessage(finalSnapshot.message || "Document parsed successfully.");
        setResult({
          ...completedJob,
          canonical: completedJob.parsed_candidate_profile || null,
          provenance: completedJob.provenance || null,
          profile: completedJob.profile || {},
        });

        if (onCompleteRef.current) {
          onCompleteRef.current(null, completedJob);
        }
        return completedJob;
      }

      // Immediate completion (no polling needed)
      setStatus("completed");
      setProgress(100);
      setPhase("complete");
      setMessage("Document parsed successfully.");
      setResult({
        ...parserResult,
        canonical: parserResult.parsed_candidate_profile || null,
        provenance: parserResult.provenance || null,
        profile: parserResult.profile || {},
      });

      if (onCompleteRef.current) {
        onCompleteRef.current(null, parserResult);
      }
      return parserResult;
    } catch (err) {
      if (controller.signal.aborted) return null;

      clearPersistedJob();
      const errorMessage = err?.details?.message || err?.message || "The parser could not read this document.";
      setStatus("failed");
      setError(errorMessage);
      setMessage(errorMessage);

      if (onCompleteRef.current) {
        onCompleteRef.current(err, null);
      }
      return null;
    }
  }, [reset]);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    clearPersistedJob();
    setStatus("idle");
  }, []);

  return {
    status,
    progress,
    phase,
    message,
    result,
    error,
    jobId,
    isBusy: status === "uploading" || status === "processing",
    upload,
    reset,
    cancel,
  };
}
