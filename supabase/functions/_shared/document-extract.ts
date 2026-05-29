import * as pdfjsLib from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MIN_EXTRACTED_TEXT_LENGTH = 80;

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeWhitespace(rawText: string) {
  return String(rawText || "")
    .replace(/\x00/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ ]*\n[ ]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferDocumentType(fileName: string, mimeType: string) {
  const name = toText(fileName).toLowerCase();
  const mime = toText(mimeType).toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("rtf") || name.endsWith(".rtf")) return "rtf";
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) return "text";
  if (mime.includes("word") || name.endsWith(".docx") || name.endsWith(".doc")) return "word";
  return "unknown";
}

function stripRtf(text: string) {
  return String(text || "")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-f]{2}/gi, " ")
    .replace(/\{\\[^{}]*\}/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\\[a-z]+-?\d* ?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function extractPdfText(bytes: Uint8Array) {
  const task = pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdf = await task.promise;
  const chunks: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? String(item.str || "") : ""))
      .join(" ");
    if (pageText) chunks.push(pageText);
  }

  return normalizeWhitespace(chunks.join("\n\n"));
}

export async function extractDocumentIntakeFromFile(file: File, notes = "") {
  const fileName = file?.name || "uploaded-document";
  const mimeType = file?.type || "";
  const documentType = inferDocumentType(fileName, mimeType);
  const buffer = new Uint8Array(await file.arrayBuffer());

  if (!buffer.byteLength) {
    throw new Response(JSON.stringify({
      ok: false,
      error: {
        code: "ERR_EMPTY_UPLOAD",
        message: "This upload did not contain any readable file data.",
        retryable: false,
        user_action: "Choose the original document again and retry the upload.",
      },
    }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Response(JSON.stringify({
      ok: false,
      error: {
        code: "ERR_FILE_TOO_LARGE",
        message: "This document is larger than the current upload limit.",
        retryable: false,
        user_action: "Compress the file or upload a version under 5 MB.",
      },
    }), { status: 413, headers: { "Content-Type": "application/json" } });
  }

  let extractedText = "";
  if (documentType === "pdf") {
    try {
      extractedText = await extractPdfText(buffer);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "PDF extraction failed";
      throw new Response(JSON.stringify({
        ok: false,
        error: {
          code: "ERR_PDF_CORRUPTED",
          message: "We could not read this PDF successfully.",
          retryable: false,
          user_action: "Try a cleaner export or a text-based PDF.",
          detail,
        },
      }), { status: 422, headers: { "Content-Type": "application/json" } });
    }
  } else if (documentType === "text") {
    extractedText = normalizeWhitespace(new TextDecoder("utf-8").decode(buffer));
  } else if (documentType === "rtf") {
    extractedText = normalizeWhitespace(stripRtf(new TextDecoder("utf-8").decode(buffer)));
  } else {
    throw new Response(JSON.stringify({
      ok: false,
      error: {
        code: "ERR_UNSUPPORTED_FILE_TYPE",
        message: "This file type is not supported by the server-side parser yet.",
        retryable: false,
        user_action: "Upload a PDF, TXT, or RTF file for now.",
      },
    }), { status: 415, headers: { "Content-Type": "application/json" } });
  }

  if (extractedText.length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new Response(JSON.stringify({
      ok: false,
      error: {
        code: "ERR_PDF_NO_TEXT",
        message: "We could not extract enough selectable text from this document.",
        retryable: false,
        user_action: "Upload a text-based version or run OCR before retrying.",
      },
    }), { status: 422, headers: { "Content-Type": "application/json" } });
  }

  return {
    rawText: extractedText,
    sourceFilename: fileName,
    mimeType,
    documentType,
    rawTextHash: await sha256Hex(buffer),
    notes: toText(notes),
  };
}
