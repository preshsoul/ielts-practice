import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildDocumentIntake } from "../services/documentIntake.js";
import { supabase } from "../services/supabaseData.js";

export default function ScholarshipDocumentImport({
  authUser,
  profile,
  onImport,
  busy,
  message,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [manualNotes, setManualNotes] = useState("");
  const [status, setStatus] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [showReveal, setShowReveal] = useState(false);
  const [revealPhase, setRevealPhase] = useState("searching");
  const revealTimerRef = useRef(null);
  const revealPhaseTimerRef = useRef(null);
  const revealFadeTimerRef = useRef(null);

  const suggestedKeywords = useMemo(() => analysis?.keywords || [], [analysis]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
      }
      if (revealPhaseTimerRef.current) {
        window.clearTimeout(revealPhaseTimerRef.current);
      }
      if (revealFadeTimerRef.current) {
        window.clearTimeout(revealFadeTimerRef.current);
      }
    };
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) {
      setStatus("Choose a PDF, DOC, or DOCX first.");
      return;
    }
    const intake = analysis || await buildDocumentIntake(selectedFile, manualNotes);
    let normalizedIntake = intake;
      if (supabase?.functions?.invoke) {
        const { data, error } = await supabase.functions.invoke("document-intake", {
          body: intake,
        });
        if (error) {
        setStatus(error.message || "We couldn’t read that document just now.");
          return;
        } else if (data?.ok && data.intake) {
          normalizedIntake = data.intake;
        } else if (data?.error) {
        setStatus(data.error.message || "We couldn’t understand that document yet.");
          return;
        }
      }

    setAnalysis(normalizedIntake);

    const result = await onImport({ intake: normalizedIntake });
    if (result?.ok) {
      setSelectedFile(null);
      setManualNotes("");
      setStatus("");
      setRevealPhase("searching");
      setShowReveal(true);
      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
      }
      if (revealPhaseTimerRef.current) {
        window.clearTimeout(revealPhaseTimerRef.current);
      }
      if (revealFadeTimerRef.current) {
        window.clearTimeout(revealFadeTimerRef.current);
      }
      revealPhaseTimerRef.current = window.setTimeout(() => {
        setRevealPhase("ready");
      }, 1400);
      revealFadeTimerRef.current = window.setTimeout(() => {
        setRevealPhase("fading");
      }, 2200);
      revealTimerRef.current = window.setTimeout(() => {
        setShowReveal(false);
        setRevealPhase("searching");
      }, 2800);
      return;
    }
    setStatus(result?.message || "Unable to save the document right now.");
  };

  return (
    <div style={{ position: "relative", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "12px", padding: 16, marginBottom: 16, overflow: "hidden" }}>
      {showReveal && (
        <div className={`cv-match-reveal cv-match-reveal--${revealPhase}`} role="status" aria-live="polite" aria-label="Finding your perfect opportunity">
          <div className="cv-match-reveal__panel">
            <div className="cv-match-reveal__hero">
              <div className="cv-match-reveal__illustration" aria-hidden="true">
                <span className="cv-match-reveal__orb cv-match-reveal__orb--large" />
                <span className="cv-match-reveal__orb cv-match-reveal__orb--small" />
                <span className="cv-match-reveal__trail cv-match-reveal__trail--one" />
                <span className="cv-match-reveal__trail cv-match-reveal__trail--two" />
                <span className="cv-match-reveal__spark cv-match-reveal__spark--one" />
                <span className="cv-match-reveal__spark cv-match-reveal__spark--two" />
                <span className="cv-match-reveal__glow" />
              </div>
              <div className="cv-match-reveal__copywrap">
                <div className="cv-match-reveal__eyebrow">{revealPhase === "ready" ? "Matches ready" : "Working for you"}</div>
                <div className="cv-match-reveal__title">
                  {revealPhase === "ready" || revealPhase === "fading"
                    ? "Your matches are ready"
                    : "Wait whilst we find your Perfect opportunity"}
                </div>
                <div className="cv-match-reveal__copy">
                  {revealPhase === "ready" || revealPhase === "fading"
                    ? "We found a shortlist shaped around your profile. Take a look at the best opportunities waiting for you."
                    : "We’re reading your CV and lining up scholarships that feel right for you."}
                </div>
                {(revealPhase === "ready" || revealPhase === "fading") && (
                  <div className="cv-match-reveal__shimmerText">A tailored shortlist is waiting below.</div>
                )}
              </div>
            </div>
            <div className="cv-match-reveal__steps">
              <div className="cv-match-reveal__step">
                <span className="cv-match-reveal__dot" />
                <span>{revealPhase === "ready" || revealPhase === "fading" ? "Profile understood" : "Reading your experience"}</span>
              </div>
              <div className="cv-match-reveal__step">
                <span className="cv-match-reveal__dot" />
                <span>{revealPhase === "ready" || revealPhase === "fading" ? "Best matches selected" : "Matching your profile"}</span>
              </div>
              <div className="cv-match-reveal__step">
                <span className="cv-match-reveal__dot" />
                <span>{revealPhase === "ready" || revealPhase === "fading" ? "Ready to explore" : "Preparing your shortlist"}</span>
              </div>
            </div>
            <div className="cv-match-reveal__bar">
              <span className="cv-match-reveal__bar-fill" />
            </div>
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, fontFamily: "var(--font-ui)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Document intake</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", marginBottom: 12 }}>
        Upload a CV, transcript, or support document here. We’ll read it and use it to shape a better match for you.
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7, marginBottom: 10 }}>
        {profile ? "Your account is ready to receive documents." : "Sign in first so the upload can be tied to your profile."}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          onChange={async (e) => {
            const file = e.target.files?.[0] || null;
            setSelectedFile(file);
            setStatus("");
            setAnalysis(null);
            if (file) {
              try {
                const nextAnalysis = await buildDocumentIntake(file, manualNotes);
                setAnalysis(nextAnalysis);
              } catch {
                setStatus("We saved the file metadata, but preview parsing is limited for this document type.");
              }
            }
          }}
        />
        <textarea
          value={manualNotes}
          onChange={async (e) => {
            const nextNotes = e.target.value;
            setManualNotes(nextNotes);
            if (selectedFile) {
              try {
                const nextAnalysis = await buildDocumentIntake(selectedFile, nextNotes);
                setAnalysis(nextAnalysis);
              } catch {
                // leave the previous preview in place
              }
            }
          }}
          placeholder="Optional note about this document, for example 'master's application CV' or 'January transcript'."
          rows={3}
          style={{ width: "100%", padding: 10, borderRadius: 8, resize: "vertical" }}
        />
        {selectedFile && (
          <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>
            Selected: {selectedFile.name} {selectedFile.size ? `(${Math.round(selectedFile.size / 1024)} KB)` : ""}
            {suggestedKeywords.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Clues we found: {suggestedKeywords.join(" • ")}
              </div>
            )}
            {analysis?.parsedProfile?.academic?.degreeClass && <div style={{ marginTop: 6 }}>Degree class: {analysis.parsedProfile.academic.degreeClass}</div>}
            {analysis?.parsedProfile?.targetDegreeLevel && <div>Target level: {analysis.parsedProfile.targetDegreeLevel}</div>}
            {analysis?.confidence !== undefined && <div>Parsing confidence: {Math.round(analysis.confidence * 100)}%</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary-btn" onClick={handleUpload} disabled={!authUser || busy || !selectedFile}>
            {busy ? "Saving..." : "Save to account"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>
          {authUser ? "Your document will be linked to your profile." : "Sign in first to save the document to your account."}
        </div>
        {message && !showReveal && <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>{message}</div>}
        {status && !showReveal && <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>{status}</div>}
      </div>
    </div>
  );
}
