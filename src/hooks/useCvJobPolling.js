import { useState, useEffect, useRef, useCallback } from "react";
import { getCvParseJob, getCvParserJobSnapshot } from "../services/cvParserClient.js";

const STORAGE_KEY = "loci.cvParserJob";
const MAX_JOB_AGE_MS = 5 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 45000;

function persistJob(jobId) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, at: Date.now() }));
  } catch { /* sessionStorage unavailable */ }
}

function clearPersistedJob() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* sessionStorage unavailable */ }
}

function getPersistedJobId() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > MAX_JOB_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.jobId || null;
  } catch {
    return null;
  }
}

export function useCvJobPolling({ intervalMs = DEFAULT_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [phase, setPhase] = useState(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

  const abortRef = useRef(null);
  const onCompleteRef = useRef(null);
  const onProgressRef = useRef(null);
  const jobIdRef = useRef(jobId);
  jobIdRef.current = jobId;

  const poll = useCallback(async (targetJobId, { onComplete, onProgress } = {}) => {
    const controller = new AbortController();
    abortRef.current = controller;
    onCompleteRef.current = onComplete || null;
    onProgressRef.current = onProgress || null;

    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      if (controller.signal.aborted) return;

      try {
        const job = await getCvParseJob(targetJobId);
        if (controller.signal.aborted) return;

        const snapshot = getCvParserJobSnapshot(job);

        if (onProgressRef.current) {
          onProgressRef.current(snapshot, job);
        }
        setPhase(snapshot.phase || null);
        setProgress(snapshot.progress ?? 0);
        if (snapshot.message) setMessage(snapshot.message);

        if (snapshot.state === "completed") {
          setStatus("completed");
          setPhase("complete");
          setProgress(100);
          setMessage(snapshot.message || "Parsing complete.");
          setResult(job);
          setIsPolling(false);
          clearPersistedJob();
          if (onCompleteRef.current) onCompleteRef.current(null, job);
          return;
        }

        if (snapshot.state === "failed") {
          const errMsg = snapshot.error?.message || snapshot.message || "Parsing failed.";
          setStatus("failed");
          setError(errMsg);
          setMessage(errMsg);
          setIsPolling(false);
          clearPersistedJob();
          const err = Object.assign(new Error(errMsg), { details: snapshot.error || null, job });
          if (onCompleteRef.current) onCompleteRef.current(err, null);
          return;
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        // Network error during poll — keep retrying until timeout
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    if (!controller.signal.aborted) {
      setStatus("failed");
      const errMsg = "The parser is taking longer than expected. Please try again in a moment.";
      setError(errMsg);
      setMessage(errMsg);
      setIsPolling(false);
      clearPersistedJob();
      if (onCompleteRef.current) onCompleteRef.current(new Error(errMsg), null);
    }
  }, [intervalMs, timeoutMs]);

  const startPolling = useCallback((newJobId, callbacks = {}) => {
    setJobId(newJobId);
    setStatus("processing");
    setPhase(null);
    setProgress(0);
    setMessage("");
    setResult(null);
    setError(null);
    setIsPolling(true);
    persistJob(newJobId);
    poll(newJobId, callbacks);
  }, [poll]);

  const cancelPolling = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsPolling(false);
    clearPersistedJob();
  }, []);

  // On mount, check sessionStorage for a stale job and auto-resume
  useEffect(() => {
    const staleJobId = getPersistedJobId();
    if (staleJobId) {
      setJobId(staleJobId);
      setStatus("processing");
      setMessage("Resuming document parsing...");
      setIsPolling(true);
      poll(staleJobId);
    }
  }, [poll]);

  // Visibility change — re-verify job status when tab regains focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const currentJobId = jobIdRef.current;
      if (!currentJobId) return;

      getCvParseJob(currentJobId).then((job) => {
        const snapshot = getCvParserJobSnapshot(job);
        if (snapshot.state === "completed") {
          setStatus("completed");
          setPhase("complete");
          setProgress(100);
          setMessage(snapshot.message || "Parsing complete.");
          setResult(job);
          setIsPolling(false);
          clearPersistedJob();
        } else if (snapshot.state === "failed") {
          setStatus("failed");
          setError(snapshot.message || "Parsing failed.");
          setIsPolling(false);
          clearPersistedJob();
        } else if (snapshot.state === "processing" && !abortRef.current) {
          poll(currentJobId);
        }
      }).catch(() => { /* ignore transient network errors on visibility check */ });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [poll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return {
    jobId,
    status,
    phase,
    progress,
    message,
    result,
    error,
    isPolling,
    startPolling,
    cancelPolling,
  };
}
