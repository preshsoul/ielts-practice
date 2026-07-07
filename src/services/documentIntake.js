/**
 * Minimal client-side document type detection.
 * All text extraction, PDF/DOCX parsing, hashing, heuristics, and confidence
 * scoring now live exclusively in the Supabase cv-parser Edge Function.
 * The frontend only detects the document type from the filename extension.
 */

export function inferDocumentType(file) {
  const name = (file?.name || "").toLowerCase();
  const mime = (file?.type || "").toLowerCase();
  // Only DOCX/Word files are accepted — PDF parsing is not supported in this release.
  if (mime.includes("word") || name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc";
  return "unknown";
}
