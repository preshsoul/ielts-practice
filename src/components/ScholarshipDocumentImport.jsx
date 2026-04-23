import React, { useMemo, useState } from "react";
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

  const suggestedKeywords = useMemo(() => analysis?.keywords || [], [analysis]);

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
        setStatus("Backend parser unavailable right now. Saved with local validation instead.");
      } else if (data?.ok && data.intake) {
        normalizedIntake = data.intake;
      } else if (data?.error) {
        setStatus(data.error.message || "Backend parser rejected this document.");
        return;
      }
    }

    setAnalysis(normalizedIntake);

    const result = await onImport({ intake: normalizedIntake });
    if (result?.ok) {
      setSelectedFile(null);
      setManualNotes("");
      setStatus("CV intake saved to your account.");
      return;
    }
    setStatus(result?.message || "Unable to save the document right now.");
  };

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "12px", padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, fontFamily: "var(--font-ui)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Document intake</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", marginBottom: 12 }}>
        Upload a CV, transcript, or support document here. We persist the intake against your account now, then we can wire server-side parsing to project the extracted details back into your profile.
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7, marginBottom: 10 }}>
        {profile ? "Your account is ready to receive document records." : "Sign in first so the upload can be tied to your profile."}
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
                Signals: {suggestedKeywords.join(" • ")}
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
          {authUser ? "This will create a CV intake record tied to your profile." : "Sign in first to save the document to your account."}
        </div>
        {message && <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>{message}</div>}
        {status && <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>{status}</div>}
      </div>
    </div>
  );
}
