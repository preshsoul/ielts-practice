import React, { useState } from "react";
import { useDocumentImport } from "../hooks/useDocumentImport.js";

function inferDocumentType(file) {
  const name = (file?.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc";
  if (name.endsWith(".rtf")) return "rtf";
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) return "text";
  return "unknown";
}

export default function ScholarshipDocumentImport({
  authUser,
  profile,
  onImport,
  busy,
  message,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [manualNotes, setManualNotes] = useState("");

  const {
    status: parserStatus,
    progress,
    phase,
    message: parserMessage,
    result,
    error: parserError,
    isBusy: parserBusy,
    upload,
    reset: resetParser,
  } = useDocumentImport();

  const handleUpload = async () => {
    if (!selectedFile) return;
    const parserResult = await upload(selectedFile, manualNotes);
    if (!parserResult) return;

    const metadata = parserResult?.metadata || {};
    const canonical = parserResult?.parsed_candidate_profile || null;
    const provenance = parserResult?.provenance || null;

    const intake = {
      label: manualNotes.trim() || selectedFile.name,
      sourceFilename: selectedFile.name,
      mimeType: selectedFile.type || "",
      documentType: inferDocumentType(selectedFile),
      rawTextHash: metadata?.source_document_hash || null,
      extractedExcerpt: metadata?.extracted_text_preview || "",
      extractedText: "",
      keywords: Array.isArray(canonical?.keywords) ? canonical.keywords : [],
      parsedProfile: parserResult?.profile || {},
      parsedCandidateProfile: canonical,
      provenance,
      confidence: parserResult?.confidence_score ?? 0,
    };

    const saveResult = await onImport({ intake });
    if (saveResult?.ok) {
      setSelectedFile(null);
      setManualNotes("");
      resetParser();
    }
  };

  const overallBusy = busy || parserBusy;
  const statusText =
    parserMessage || message || (parserStatus === "idle" ? "" : parserStatus);

  return (
    <div style={{ position: "relative", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "12px", padding: 16, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, fontFamily: "var(--font-ui)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Document intake</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", marginBottom: 12 }}>
        Upload a CV, transcript, or support document here. We'll read it and use it to shape a better match for you.
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7, marginBottom: 10 }}>
        {profile ? "Your account is ready to receive documents." : "Sign in first so the upload can be tied to your profile."}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            setSelectedFile(file);
            resetParser();
          }}
        />
        <textarea
          value={manualNotes}
          onChange={(e) => setManualNotes(e.target.value)}
          placeholder="Optional note about this document, for example 'master's application CV' or 'January transcript'."
          rows={3}
          style={{ width: "100%", padding: 10, borderRadius: 8, resize: "vertical" }}
        />
        {selectedFile && (
          <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>
            Selected: {selectedFile.name} {selectedFile.size ? `(${Math.round(selectedFile.size / 1024)} KB)` : ""}
            {parserStatus === "completed" && result?.profile && (
              <>
                {result.profile?.personal_details?.full_legal_name && (
                  <div style={{ marginTop: 6 }}>Name: {result.profile.personal_details.full_legal_name}</div>
                )}
                {result.confidence_score !== undefined && (
                  <div>Parsing confidence: {Math.round((result.confidence_score || 0) * 100)}%</div>
                )}
              </>
            )}
          </div>
        )}
        {parserStatus === "processing" && (
          <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>
            <div style={{ width: "100%", height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", transition: "width 0.3s ease" }} />
            </div>
            {phase && <div style={{ marginTop: 4 }}>Phase: {String(phase).replace(/_/g, " ")}</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary-btn" onClick={handleUpload} disabled={!authUser || overallBusy || !selectedFile}>
            {overallBusy ? "Saving..." : "Save to account"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>
          {authUser ? "Your document will be linked to your profile." : "Sign in first to save the document to your account."}
        </div>
        {statusText && <div style={{ fontSize: 12, color: parserError ? "var(--danger)" : "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>{statusText}</div>}
      </div>
    </div>
  );
}
