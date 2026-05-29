/**
 * Minimal client-side document type detection.
 * All text extraction, PDF/DOCX parsing, hashing, heuristics, and confidence
 * scoring now live exclusively in the Supabase cv-parser Edge Function.
 * The frontend only detects the document type from the filename extension.
 */

export function inferDocumentType(file) {
  const name = (file?.name || "").toLowerCase();
  const mime = (file?.type || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("word") || name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc";
  if (mime.includes("rtf") || name.endsWith(".rtf")) return "rtf";
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) return "text";
  return "unknown";
}
