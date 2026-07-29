/**
 * Minimal client-side document type detection.
 * All text extraction, PDF/DOCX parsing, hashing, heuristics, and confidence
 * scoring now live exclusively in the Supabase cv-parser Edge Function.
 * The frontend only detects the document type from the filename extension.
 */

export const MAX_DOCUMENT_UPLOAD_BYTES = 5 * 1024 * 1024;

export const SUPPORTED_DOCUMENT_ACCEPT = [
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".rtf",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/rtf",
  "text/rtf",
].join(",");

export const SUPPORTED_DOCUMENT_FORMAT_LABEL = "PDF, DOCX, DOC, TXT, or RTF";

export function inferDocumentType(file) {
  const name = (file?.name || "").toLowerCase();
  const mime = (file?.type || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".doc")) return "doc";
  if (mime.includes("word") || mime.includes("openxmlformats-officedocument") || name.endsWith(".docx")) return "docx";
  if (mime.includes("rtf") || name.endsWith(".rtf")) return "rtf";
  if (mime.startsWith("text/") || name.endsWith(".txt")) return "text";
  return "unknown";
}

export function getDocumentUploadError(file) {
  if (!file) return "";
  if (file.size && file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    return "Choose a document under 5 MB.";
  }
  if (inferDocumentType(file) === "unknown") {
    return `Upload a supported document: ${SUPPORTED_DOCUMENT_FORMAT_LABEL}.`;
  }
  return "";
}
