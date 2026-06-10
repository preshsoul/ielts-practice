import * as pdfjsLib from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

// Deno compatibility: the legacy pdfjs-dist build runs in the main thread
// without a web worker when workerSrc is disabled.
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

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

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function extractPdfText(bytes: Uint8Array) {
  // Try pdfjs-dist first (handles complex PDFs with glyph mapping).
  // If it fails (common in Deno — missing DOM APIs), fall back to the
  // native extractor which handles text-based PDFs reliably.
  try {
    const task = pdfjsLib.getDocument({
      data: bytes,
      useSystemFonts: true,
      isEvalSupported: true,
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
    const text = normalizeWhitespace(chunks.join("\n\n"));
    if (text.length >= MIN_EXTRACTED_TEXT_LENGTH) return text;
  } catch {
    // pdfjs-dist failed — fall through to native extractor.
  }

  return extractPdfTextNative(bytes);
}

/**
 * Pure-TypeScript PDF text extractor — no DOM APIs required.
 * Handles FlateDecode-compressed streams and BT/ET text blocks.
 * Works reliably in Deno for text-based PDFs.
 */
async function extractPdfTextNative(bytes: Uint8Array): Promise<string> {
  const raw = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];

  // Find all stream objects
  const streamRegex = /(\d+ \d+ obj[\s\S]*?endobj)/g;
  let objMatch: RegExpExecArray | null;

  while ((objMatch = streamRegex.exec(raw)) !== null) {
    const obj = objMatch[0];
    if (!obj.includes("stream") || !obj.includes("BT")) continue;

    const isFlate = /\/Filter\s*\/FlateDecode/i.test(obj);
    const streamStart = obj.indexOf("stream");
    const streamEnd = obj.lastIndexOf("endstream");
    if (streamStart === -1 || streamEnd === -1) continue;

    // Slice from after "stream\n" to before "endstream"
    let streamSlice = obj.slice(streamStart + 6, streamEnd);
    // Strip leading \n or \r\n after "stream" keyword
    streamSlice = streamSlice.replace(/^[\r\n]+/, "").trimEnd();

    let text: string;
    if (isFlate) {
      try {
        // Convert latin1 string back to bytes
        const compressed = new Uint8Array(streamSlice.length);
        for (let i = 0; i < streamSlice.length; i++) {
          compressed[i] = streamSlice.charCodeAt(i) & 0xff;
        }
        const decompressed = await decompressBytes(compressed);
        text = new TextDecoder("utf-8").decode(decompressed);
      } catch {
        text = streamSlice;
      }
    } else {
      text = streamSlice;
    }

    // Extract text from BT...ET blocks
    const btRegex = /BT\s*([\s\S]*?)\s*ET/g;
    let btMatch: RegExpExecArray | null;
    while ((btMatch = btRegex.exec(text)) !== null) {
      const block = btMatch[1];

      // Tj operator: (text) Tj
      let tjMatch: RegExpExecArray | null;
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        const decoded = decodePdfString(tjMatch[1]);
        if (decoded.trim()) chunks.push(decoded);
      }

      // TJ operator: [(text) num ...] TJ
      const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
      let tjArrMatch: RegExpExecArray | null;
      while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
        const strRegex = /\(([^)]*)\)/g;
        let strMatch: RegExpExecArray | null;
        while ((strMatch = strRegex.exec(tjArrMatch[1])) !== null) {
          const decoded = decodePdfString(strMatch[1]);
          if (decoded.trim()) chunks.push(decoded);
        }
      }
    }
  }

  return normalizeWhitespace(chunks.join(" "));
}

async function decompressBytes(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Decode PDF string escapes */
function decodePdfString(str: string): string {
  return str
    .replace(/\\([nrtf])/g, (_m, c) => ({ n: "\n", r: "\r", t: "\t", f: "\f" }[c] || c))
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)));
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
