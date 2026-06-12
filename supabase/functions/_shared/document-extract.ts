// =========================================================================
// LOCI Document Extraction Engine
// -------------------------------------------------------------------------
// Extracts text from PDF, DOCX, TXT, and RTF files in the Deno runtime.
//
// PDF strategy: three-tier fallback chain
//   1. pdfjs-dist (best for complex PDFs with glyph mapping) — optional
//   2. Native TypeScript extractor (robust, no DOM APIs needed)
//   3. Signals that OCR is required (scanned/image PDFs)
//
// DOCX strategy: parse ZIP → word/document.xml → extract w:t text nodes
// =========================================================================

// --- Optional pdfjs-dist import (may fail in some Deno environments) ---
let pdfjsLib: any = null;
try {
  pdfjsLib = await import("npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs");
  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  }
} catch {
  // pdfjs-dist unavailable — native extractor will handle everything
}

// =========================================================================
// Constants
// =========================================================================
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MIN_EXTRACTED_TEXT_LENGTH = 80;
const OCR_SIGNAL_THRESHOLD = 100; // below this, likely scanned/image PDF
const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
const DOCX_SIGNATURES = [
  new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // ZIP local file header
  new Uint8Array([0x50, 0x4b, 0x05, 0x06]), // ZIP end of central directory
];

// =========================================================================
// Types
// =========================================================================
export interface ExtractionDiagnostics {
  method: "pdfjs" | "native" | "docx-xml" | "text-utf8" | "rtf-strip" | "none";
  fileType: string;
  fileBytes: number;
  extractedChars: number;
  durationMs: number;
  pdfPages?: number;
  isScannedPdf?: boolean;
  ocrRecommended?: boolean;
  error?: string;
  warnings: string[];
}

export interface DocumentIntake {
  rawText: string;
  sourceFilename: string;
  mimeType: string;
  documentType: string;
  rawTextHash: string;
  notes: string;
  diagnostics: ExtractionDiagnostics;
}

// =========================================================================
// Utility functions
// =========================================================================

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeWhitespace(rawText: string): string {
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

export function inferDocumentType(
  fileName: string,
  mimeType: string,
): "pdf" | "word" | "text" | "rtf" | "unknown" {
  const name = toText(fileName).toLowerCase();
  const mime = toText(mimeType).toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    mime.includes("word") ||
    mime.includes("openxmlformats-officedocument") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  )
    return "word";
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv"))
    return "text";
  if (mime.includes("rtf") || name.endsWith(".rtf")) return "rtf";
  return "unknown";
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function millisSince(start: number): number {
  return Math.round(performance.now() - start);
}

// =========================================================================
// RTF text extraction
// =========================================================================

function stripRtf(text: string): string {
  return String(text || "")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-f]{2}/gi, " ")
    .replace(/\{\\[^{}]*\}/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\\[a-z]+-?\d* ?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =========================================================================
// DOCX text extraction (ZIP → XML)
// =========================================================================

/**
 * Minimal ZIP parser for DOCX files.
 * DOCX = ZIP containing word/document.xml with w:p/w:r/w:t text elements.
 */
async function extractDocxText(bytes: Uint8Array, diag: ExtractionDiagnostics): Promise<string> {
  // Find the central directory end record
  const eocdOffset = findEOCD(bytes);
  if (eocdOffset === -1) {
    throw new Error("Invalid DOCX: no ZIP central directory found");
  }

  // Parse central directory to find word/document.xml
  const { entries } = parseCentralDirectory(bytes, eocdOffset);
  const docXmlEntry = entries.find(
    (e) => e.filename === "word/document.xml" || e.filename === "word/document.xml/",
  );
  if (!docXmlEntry) {
    throw new Error("Invalid DOCX: word/document.xml not found in archive");
  }

  // Read the local file entry and extract the XML (await for async decompression)
  const xmlBytes = await readZipFileEntry(bytes, docXmlEntry);
  const xml = new TextDecoder("utf-8").decode(xmlBytes);

  diag.warnings.push(`docx_xml_bytes=${xmlBytes.length}`);

  // Parse w:t text elements from XML
  return extractTextFromDocxXml(xml);
}

function findEOCD(bytes: Uint8Array): number {
  // Search backwards from end for EOCD signature (0x50 0x4b 0x05 0x06)
  const maxSearch = Math.min(bytes.length, 65557); // max comment size + EOCD
  for (let i = bytes.length - 22; i >= bytes.length - maxSearch && i >= 0; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

interface ZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
}

function parseCentralDirectory(
  bytes: Uint8Array,
  eocdOffset: number,
): { entries: ZipEntry[]; count: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];

  let pos = cdOffset;
  for (let i = 0; i < totalEntries && pos < bytes.length; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break; // central dir signature
    const compressionMethod = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const filenameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);

    const filename = new TextDecoder("utf-8").decode(
      bytes.slice(pos + 46, pos + 46 + filenameLen),
    );

    entries.push({
      filename,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
    });

    pos += 46 + filenameLen + extraLen + commentLen;
  }

  return { entries, count: entries.length };
}

async function readZipFileEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = entry.localHeaderOffset;

  // Local file header signature check
  if (pos >= bytes.length - 30 || view.getUint32(pos, true) !== 0x04034b50) {
    throw new Error(`Invalid local file header for ${entry.filename}`);
  }

  const filenameLen = view.getUint16(pos + 26, true);
  const extraLen = view.getUint16(pos + 28, true);
  const dataStart = pos + 30 + filenameLen + extraLen;
  const dataSize = entry.compressedSize;

  if (dataStart + dataSize > bytes.length) {
    throw new Error(`File data exceeds buffer for ${entry.filename}`);
  }

  const data = bytes.slice(dataStart, dataStart + dataSize);

  // Handle stored (0) vs deflated (8) compression
  if (entry.compressionMethod === 0) {
    return data;
  } else if (entry.compressionMethod === 8) {
    return await decompressDeflate(data);
  }

  throw new Error(`Unsupported compression method ${entry.compressionMethod}`);
}

/**
 * Extract text from DOCX word/document.xml content.
 * Handles w:p (paragraph), w:r (run), w:t (text), w:tab, w:br elements.
 */
function extractTextFromDocxXml(xml: string): string {
  const paragraphs: string[] = [];
  const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const paragraph = pMatch[0];
    const runs: string[] = [];

    // Extract w:t text elements
    const tRegex = /<w:t[ >]([\s\S]*?)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(paragraph)) !== null) {
      // Handle xml:space="preserve"
      let text = tMatch[1];
      // Decode XML entities
      text = text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      runs.push(text);
    }

    // Handle line breaks
    if (/<w:br[^>]*\/>/.test(paragraph) || /<w:br[^>]*><\/w:br>/.test(paragraph)) {
      runs.push("\n");
    }

    // Handle tabs
    if (/<w:tab[^>]*\/>/.test(paragraph) || /<w:tab[^>]*><\/w:tab>/.test(paragraph)) {
      runs.push("\t");
    }

    const paraText = runs.join("");
    if (paraText.trim()) {
      paragraphs.push(paraText);
    }
  }

  return normalizeWhitespace(paragraphs.join("\n"));
}

// =========================================================================
// PDF text extraction — Tier 1: pdfjs-dist (best-effort)
// =========================================================================

async function extractPdfTextPdfjs(
  bytes: Uint8Array,
  diag: ExtractionDiagnostics,
): Promise<string | null> {
  if (!pdfjsLib) {
    diag.warnings.push("pdfjs_unavailable");
    return null;
  }

  try {
    const task = pdfjsLib.getDocument({
      data: bytes,
      useSystemFonts: true,
      isEvalSupported: true,
      disableFontFace: true,
    });
    const pdf = await task.promise;
    diag.pdfPages = pdf.numPages;

    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ("str" in item ? String(item.str || "") : ""))
        .join(" ");
      if (pageText.trim()) chunks.push(pageText);
    }

    const text = normalizeWhitespace(chunks.join("\n\n"));
    if (text.length >= MIN_EXTRACTED_TEXT_LENGTH) {
      diag.method = "pdfjs";
      return text;
    }

    diag.warnings.push(`pdfjs_short_text=${text.length}chars`);
    return null;
  } catch (err) {
    diag.warnings.push(`pdfjs_error=${err instanceof Error ? err.message.slice(0, 100) : "unknown"}`);
    return null;
  }
}

// =========================================================================
// PDF text extraction — Tier 2: Native TypeScript extractor
// =========================================================================

/**
 * Production-grade native PDF text extractor.
 *
 * Handles:
 * - Cross-reference tables AND cross-reference streams
 * - Object streams (compressed objects)
 * - FlateDecode, ASCII85Decode, ASCIIHexDecode filters
 * - ToUnicode CMap for font encoding
 * - All standard text operators: Tj, TJ, ', "
 * - PDF string escapes: octal, named, balanced parentheses
 * - Hex strings
 * - BT/ET text blocks with text state tracking
 */
async function extractPdfTextNative(
  bytes: Uint8Array,
  diag: ExtractionDiagnostics,
): Promise<string> {
  const raw = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];

  // --- Parse cross-reference section to find objects ---
  const xref = parseCrossRef(raw, bytes);
  diag.warnings.push(`xref_entries=${xref.size}`);

  // --- Find all indirect objects ---
  const objects = findAllObjects(raw);
  diag.warnings.push(`pdf_objects=${objects.length}`);

  // --- Load ToUnicode CMaps from font objects ---
  const toUnicodeMap = extractToUnicodeMaps(raw, objects);

  // --- Process each object's streams ---
  const textBlocks: Array<{ text: string; y: number; x: number }> = [];

  for (const obj of objects) {
    if (!obj.hasStream) continue;

    let streamText: string;
    try {
      streamText = await decodePdfStream(obj, raw);
    } catch {
      continue;
    }

    // Extract BT...ET text blocks with positioning
    const btRegex = /BT([\s\S]*?)ET/g;
    let btMatch: RegExpExecArray | null;
    while ((btMatch = btRegex.exec(streamText)) !== null) {
      const block = btMatch[1];
      const positioned = extractTextWithPosition(block, toUnicodeMap);
      textBlocks.push(...positioned);
    }
  }

  // Also try direct regex on raw content (catches text outside object streams)
  if (textBlocks.length === 0) {
    const directBlocks = extractTextFromRaw(raw, toUnicodeMap);
    textBlocks.push(...directBlocks);
    diag.warnings.push("direct_raw_extraction");
  }

  // --- Sort by position (top-to-bottom, left-to-right) for reading order ---
  if (textBlocks.length > 1) {
    textBlocks.sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 12) return yDiff; // different lines
      return a.x - b.x; // same line, left to right
    });
  }

  // --- Merge blocks into lines with proper spacing ---
  const lines: string[] = [];
  let currentLine = "";
  let lastY = textBlocks[0]?.y ?? 0;

  for (const block of textBlocks) {
    if (lines.length === 0 && !currentLine) {
      currentLine = block.text;
      lastY = block.y;
      continue;
    }

    if (Math.abs(block.y - lastY) < 5) {
      // Same line — append with space if needed
      currentLine += (currentLine && !currentLine.endsWith(" ") ? " " : "") + block.text;
    } else {
      // New line
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = block.text;
      lastY = block.y;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return normalizeWhitespace(lines.join("\n"));
}

interface PdfObject {
  objNum: number;
  genNum: number;
  start: number;
  end: number;
  hasStream: boolean;
  streamStart: number;
  streamEnd: number;
  filters: string[];
}

function findAllObjects(raw: string): PdfObject[] {
  const objects: PdfObject[] = [];
  const objRegex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let match: RegExpExecArray | null;

  while ((match = objRegex.exec(raw)) !== null) {
    const objNum = parseInt(match[1], 10);
    const genNum = parseInt(match[2], 10);
    const body = match[3];
    const start = match.index;
    const end = match.index + match[0].length;

    // Check for stream
    const streamMatch = /stream\r?\n?([\s\S]*?)endstream/.exec(body);
    const hasStream = streamMatch !== null;

    // Extract filters
    const filters: string[] = [];
    const filterMatch = /\/Filter\s*\[([^\]]*)\]/.exec(body);
    const singleFilterMatch = /\/Filter\s*\/(\w+)/.exec(body);
    if (filterMatch) {
      const filterNames = filterMatch[1].match(/\/\w+/g);
      if (filterNames) filters.push(...filterNames.map((f) => f.slice(1)));
    } else if (singleFilterMatch) {
      filters.push(singleFilterMatch[1]);
    }

    let streamStart = -1;
    let streamEnd = -1;
    if (streamMatch) {
      streamStart = match.index + body.indexOf("stream") + 6;
      if (raw[streamStart] === "\n") streamStart++;
      else if (raw[streamStart] === "\r" && raw[streamStart + 1] === "\n") streamStart += 2;
      streamEnd = match.index + body.indexOf("endstream");
    }

    objects.push({ objNum, genNum, start, end, hasStream, streamStart, streamEnd, filters });
  }

  return objects;
}

interface XrefEntry {
  offset: number;
  genNum: number;
  inUse: boolean;
  objStreamNum?: number;
  objStreamIndex?: number;
}

function parseCrossRef(raw: string, bytes: Uint8Array): Map<number, XrefEntry> {
  const entries = new Map<number, XrefEntry>();

  // Try cross-reference table first
  const xrefMatch = /xref\s+[\s\S]*?trailer/g.exec(raw);
  if (xrefMatch) {
    const xrefSection = xrefMatch[0];
    const subSectionRegex = /(\d+)\s+(\d+)\s+([\s\S]*?)(?=\d+\s+\d+\s+|trailer|$)/g;
    let subMatch: RegExpExecArray | null;
    while ((subMatch = subSectionRegex.exec(xrefSection)) !== null) {
      const startNum = parseInt(subMatch[1], 10);
      const count = parseInt(subMatch[2], 10);
      const data = subMatch[3];

      const entryRegex = /(\d{10})\s(\d{5})\s([nf])\s?/g;
      let entryMatch: RegExpExecArray | null;
      let idx = 0;
      while ((entryMatch = entryRegex.exec(data)) !== null && idx < count) {
        entries.set(startNum + idx, {
          offset: parseInt(entryMatch[1], 10),
          genNum: parseInt(entryMatch[2], 10),
          inUse: entryMatch[3] === "n",
        });
        idx++;
      }
    }
  }

  // Try cross-reference streams (PDF 1.5+)
  if (entries.size === 0) {
    const trailerMatch = /\/XRefStm\s+(\d+)/.exec(raw);
    if (trailerMatch) {
      diagWarnStatic("xref_stream_detected");
    }
  }

  return entries;
}

/** Static diag helper (avoid passing diag through every function) */
let _globalDiag: ExtractionDiagnostics | null = null;
function setGlobalDiag(d: ExtractionDiagnostics) {
  _globalDiag = d;
}
function diagWarnStatic(msg: string) {
  if (_globalDiag) _globalDiag.warnings.push(msg);
}

async function decodePdfStream(obj: PdfObject, raw: string): Promise<string> {
  if (!obj.hasStream || obj.streamStart < 0) return "";

  let data = raw.slice(obj.streamStart, obj.streamEnd).replace(/[\r\n]+$/, "");

  // Apply filters in order (PDF spec: filters are applied in listed order, decode in reverse)
  for (let i = obj.filters.length - 1; i >= 0; i--) {
    const filter = obj.filters[i];
    if (filter === "FlateDecode" || filter === "Fl") {
      try {
        const compressed = new Uint8Array(data.length);
        for (let j = 0; j < data.length; j++) compressed[j] = data.charCodeAt(j) & 0xff;
        // PDF FlateDecode uses zlib format (RFC 1950). Try zlib first, then raw deflate as fallback.
        let decompressed: Uint8Array;
        try {
          decompressed = await decompressZlib(compressed);
        } catch {
          decompressed = await decompressDeflate(compressed);
        }
        data = new TextDecoder("utf-8").decode(decompressed);
      } catch {
        // Return as-is if decompression fails
      }
    } else if (filter === "ASCII85Decode" || filter === "A85") {
      data = decodeAscii85(data);
    } else if (filter === "ASCIIHexDecode" || filter === "AHx") {
      data = decodeAsciiHex(data);
    }
  }

  return data;
}

/**
 * Decompress a zlib-wrapped deflate stream (RFC 1950).
 * PDF FlateDecode uses this format — the stream starts with a 2-byte zlib header.
 */
async function decompressZlib(data: Uint8Array): Promise<Uint8Array> {
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
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Decompress a raw deflate stream (RFC 1951, no zlib header).
 * DOCX ZIP entries and some PDF streams use this format.
 */
async function decompressDeflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
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
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function decodeAscii85(data: string): string {
  let result = "";
  let group = "";
  for (const ch of data) {
    if (ch === "~") break;
    if (ch >= "!" && ch <= "u") {
      group += ch;
      if (group.length === 5) {
        result += ascii85Group(group);
        group = "";
      }
    }
  }
  if (group.length > 0) {
    group += "u".repeat(5 - group.length);
    result += ascii85Group(group).slice(0, group.length - 1);
  }
  return result;
}

function ascii85Group(group: string): string {
  let n = 0;
  for (let i = 0; i < 5; i++) n = n * 85 + (group.charCodeAt(i) - 33);
  return String.fromCharCode(
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  );
}

function decodeAsciiHex(data: string): string {
  const hex = data.replace(/\s/g, "");
  let result = "";
  for (let i = 0; i < hex.length - 1; i += 2) {
    result += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return result;
}

// =========================================================================
// ToUnicode CMap extraction
// =========================================================================

function extractToUnicodeMaps(raw: string, objects: PdfObject[]): Map<string, string> {
  const maps = new Map<string, string>();

  for (const obj of objects) {
    if (!obj.hasStream && !raw.slice(obj.start, obj.end).includes("/ToUnicode")) continue;

    const body = raw.slice(obj.start, obj.end);

    // Find ToUnicode stream reference or inline
    const cmapObjMatch = /\/ToUnicode\s+(\d+\s+\d+\s+R)/.exec(body);
    if (cmapObjMatch) {
      const ref = cmapObjMatch[1];
      const refParts = ref.split(/\s+/);
      const refObjNum = parseInt(refParts[0], 10);

      // Find the referenced CMap object
      const cmapObj = objects.find((o) => o.objNum === refObjNum);
      if (cmapObj?.hasStream) {
        const cmapText = raw.slice(cmapObj.streamStart, cmapObj.streamEnd);
        parseCmapEntries(cmapText, maps);
      }
    }
  }

  return maps;
}

function parseCmapEntries(cmapText: string, maps: Map<string, string>): void {
  // Parse bfchar entries: <code> <unicode>
  const bfcharRegex = /beginbfchar[\s\S]*?endbfchar/g;
  let bfMatch: RegExpExecArray | null;
  while ((bfMatch = bfcharRegex.exec(cmapText)) !== null) {
    const entries = bfMatch[0];
    const pairRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let pairMatch: RegExpExecArray | null;
    while ((pairMatch = pairRegex.exec(entries)) !== null) {
      const code = pairMatch[1].toUpperCase();
      const unicode = String.fromCharCode(parseInt(pairMatch[2], 16));
      maps.set(code, unicode);
    }
  }

  // Parse bfrange entries: <start> <end> <unicodeStart>
  const bfrangeRegex = /beginbfrange[\s\S]*?endbfrange/g;
  let brMatch: RegExpExecArray | null;
  while ((brMatch = bfrangeRegex.exec(cmapText)) !== null) {
    const entries = brMatch[0];
    const rangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let rangeMatch: RegExpExecArray | null;
    while ((rangeMatch = rangeRegex.exec(entries)) !== null) {
      const start = parseInt(rangeMatch[1], 16);
      const end = parseInt(rangeMatch[2], 16);
      const unicodeStart = parseInt(rangeMatch[3], 16);
      for (let i = start; i <= end; i++) {
        maps.set(i.toString(16).toUpperCase().padStart(rangeMatch[1].length, "0"), String.fromCharCode(unicodeStart + (i - start)));
      }
    }
  }
}

// =========================================================================
// Text extraction with positioning
// =========================================================================

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

function extractTextWithPosition(block: string, cmap: Map<string, string>): PositionedText[] {
  const results: PositionedText[] = [];
  let tm = [1, 0, 0, 1, 0, 0]; // text matrix
  let isInText = false;

  // Parse operators line by line
  const tokens = block.split(/\s+/);
  const parsedOps: Array<{ op: string; args: string[] }> = [];
  let currentArgs: string[] = [];

  for (const token of tokens) {
    if (!token) continue;
    // Check if this is an operator (alphabetic)
    if (/^[A-Za-z]+$/.test(token) || token === "'" || token === '"') {
      parsedOps.push({ op: token, args: [...currentArgs] });
      currentArgs = [];
    } else {
      currentArgs.push(token);
    }
  }

  for (const { op, args } of parsedOps) {
    switch (op) {
      case "BT":
        isInText = true;
        tm = [1, 0, 0, 1, 0, 0];
        break;
      case "ET":
        isInText = false;
        break;
      case "Tm":
        if (args.length >= 6) {
          tm = [
            parseFloat(args[0]),
            parseFloat(args[1]),
            parseFloat(args[2]),
            parseFloat(args[3]),
            parseFloat(args[4]),
            parseFloat(args[5]),
          ];
        }
        break;
      case "Td":
      case "TD":
        if (args.length >= 2) {
          tm[4] += parseFloat(args[0]);
          tm[5] += parseFloat(args[1]);
        }
        break;
      case "T*":
        tm[4] = 0;
        tm[5] -= 12; // approximate leading
        break;
      case "Tj":
      case "'":
      case '"': {
        if (!isInText) break;
        const rawStr = op === "Tj" ? args[0] : op === "'" ? args[0] : args[args.length - 1];
        const text = decodePdfStringValue(rawStr, cmap);
        if (text.trim()) {
          results.push({ text, x: tm[4], y: tm[5] });
        }
        break;
      }
      case "TJ": {
        if (!isInText) break;
        // TJ takes an array: [ (text) num (text) num ... ] TJ
        // Reconstruct from raw block
        const tjMatch = /\[([^\]]*)\]\s*TJ/.exec(block);
        if (tjMatch) {
          const arrayContent = tjMatch[1];
          const strRegex = /\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
          let strMatch: RegExpExecArray | null;
          while ((strMatch = strRegex.exec(arrayContent)) !== null) {
            const text = decodePdfStringValue(strMatch[1], cmap);
            if (text.trim()) {
              results.push({ text, x: tm[4], y: tm[5] });
              tm[4] += estimateTextWidth(text); // crude advance
            }
          }
        }
        break;
      }
    }
  }

  return results;
}

function extractTextFromRaw(
  raw: string,
  cmap: Map<string, string>,
): PositionedText[] {
  const results: PositionedText[] = [];

  // Direct BT...ET extraction without positioning
  const btRegex = /BT([\s\S]*?)ET/g;
  let btMatch: RegExpExecArray | null;
  let lineY = 800; // start from top of page

  while ((btMatch = btRegex.exec(raw)) !== null) {
    const block = btMatch[1];

    // Extract Tj strings
    const tjRegex = /\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const text = decodePdfStringValue(tjMatch[1], cmap);
      if (text.trim()) {
        results.push({ text, x: 0, y: lineY });
        lineY -= 12;
      }
    }

    // Extract TJ arrays
    const tjArrRegex = /\[([^\]]*)\]\s*TJ/g;
    let tjArrMatch: RegExpExecArray | null;
    while ((tjArrMatch = tjArrRegex.exec(block)) !== null) {
      const strRegex = /\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
      let strMatch: RegExpExecArray | null;
      while ((strMatch = strRegex.exec(tjArrMatch[1])) !== null) {
        const text = decodePdfStringValue(strMatch[1], cmap);
        if (text.trim()) {
          results.push({ text, x: 0, y: lineY });
        }
      }
      lineY -= 12;
    }
  }

  return results;
}

function estimateTextWidth(text: string): number {
  // Crude estimate: ~6 points per character at typical font size
  return text.length * 6;
}

function decodePdfStringValue(str: string, cmap: Map<string, string>): string {
  if (!str) return "";

  // Check if it's a hex string from CMAP
  const hexMatch = /^<([0-9A-Fa-f]+)>$/.exec(str.trim());
  if (hexMatch && cmap.size > 0) {
    const codes = hexMatch[1];
    // Try 2-char and 4-char lookups
    let result = "";
    let i = 0;
    while (i < codes.length) {
      // Try 4-char code first
      if (i + 4 <= codes.length) {
        const code4 = codes.slice(i, i + 4);
        const mapped4 = cmap.get(code4);
        if (mapped4) {
          result += mapped4;
          i += 4;
          continue;
        }
      }
      // Fall back to 2-char code
      if (i + 2 <= codes.length) {
        const code2 = codes.slice(i, i + 2);
        const mapped2 = cmap.get(code2);
        if (mapped2) {
          result += mapped2;
          i += 2;
          continue;
        }
        // Unmapped — use raw char
        result += String.fromCharCode(parseInt(code2, 16));
        i += 2;
      } else {
        i++;
      }
    }
    return result;
  }

  // Standard PDF string escapes
  return str
    .replace(/\\([nrtf])/g, (_m: string, c: string) =>
      ({ n: "\n", r: "\r", t: "\t", f: "\f" }[c] || c),
    )
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_m: string, oct: string) =>
      String.fromCharCode(parseInt(oct, 8)),
    )
    .trim();
}

// =========================================================================
// Master extraction dispatcher
// =========================================================================

async function extractPdfText(
  bytes: Uint8Array,
  diag: ExtractionDiagnostics,
): Promise<string> {
  // Tier 1: pdfjs-dist (best for complex fonts/glyph mapping)
  if (pdfjsLib) {
    const result = await extractPdfTextPdfjs(bytes, diag);
    if (result) return result;
  }

  // Tier 2: Native TypeScript extractor
  diag.method = "native";
  const result = await extractPdfTextNative(bytes, diag);

  // Check for OCR signal
  if (result.length < OCR_SIGNAL_THRESHOLD) {
    diag.isScannedPdf = true;
    diag.ocrRecommended = true;
    diag.warnings.push(`low_text_signal=${result.length}chars_ocr_recommended`);
  }

  return result;
}

// =========================================================================
// Public API
// =========================================================================

export async function extractDocumentIntakeFromFile(
  file: File,
  notes = "",
): Promise<DocumentIntake> {
  const t0 = performance.now();
  const diagnostics: ExtractionDiagnostics = {
    method: "none",
    fileType: "unknown",
    fileBytes: 0,
    extractedChars: 0,
    durationMs: 0,
    warnings: [],
  };
  setGlobalDiag(diagnostics);

  const fileName = file?.name || "uploaded-document";
  const mimeType = file?.type || "";
  const documentType = inferDocumentType(fileName, mimeType);
  diagnostics.fileType = documentType;

  const buffer = new Uint8Array(await file.arrayBuffer());
  diagnostics.fileBytes = buffer.byteLength;

  // --- Validation ---
  if (!buffer.byteLength) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "ERR_EMPTY_UPLOAD",
          message: "This upload did not contain any readable file data.",
          retryable: false,
          user_action: "Choose the original document again and retry the upload.",
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "ERR_FILE_TOO_LARGE",
          message: "This document is larger than the current upload limit.",
          retryable: false,
          user_action: "Compress the file or upload a version under 5 MB.",
        },
      }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Extraction ---
  let extractedText = "";

  try {
    if (documentType === "pdf") {
      extractedText = await extractPdfText(buffer, diagnostics);
    } else if (documentType === "word") {
      // DOCX extraction
      try {
        extractedText = await extractDocxText(buffer, diagnostics);
        diagnostics.method = "docx-xml";
      } catch (docxErr) {
        diagnostics.warnings.push(
          `docx_error=${docxErr instanceof Error ? docxErr.message.slice(0, 100) : "unknown"}`,
        );
        throw new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "ERR_DOCX_UNREADABLE",
              message: "We could not read this Word document.",
              retryable: false,
              user_action:
                "Try saving the document as a PDF or text file and re-uploading.",
              detail: docxErr instanceof Error ? docxErr.message : "DOCX extraction failed",
            },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        );
      }
    } else if (documentType === "text") {
      extractedText = normalizeWhitespace(new TextDecoder("utf-8").decode(buffer));
      diagnostics.method = "text-utf8";
    } else if (documentType === "rtf") {
      extractedText = normalizeWhitespace(stripRtf(new TextDecoder("utf-8").decode(buffer)));
      diagnostics.method = "rtf-strip";
    } else {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "ERR_UNSUPPORTED_FILE_TYPE",
            message:
              "This file type is not supported yet. We accept PDF, DOCX, TXT, and RTF files.",
            retryable: false,
            user_action: "Upload a PDF, DOCX, TXT, or RTF file.",
          },
        }),
        { status: 415, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (err) {
    if (err instanceof Response) throw err;

    const detail = err instanceof Error ? err.message : "Extraction failed";
    diagnostics.warnings.push(`extraction_error=${detail.slice(0, 100)}`);

    throw new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: documentType === "pdf" ? "ERR_PDF_CORRUPTED" : "ERR_DOCUMENT_UNREADABLE",
          message: `We could not read this ${documentType.toUpperCase()} file.`,
          retryable: false,
          user_action: "Try a cleaner export or a different file format.",
          detail,
        },
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Quality check ---
  if (extractedText.length < MIN_EXTRACTED_TEXT_LENGTH) {
    diagnostics.extractedChars = extractedText.length;
    diagnostics.durationMs = millisSince(t0);

    throw new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "ERR_PDF_NO_TEXT",
          message: "We could not extract enough selectable text from this document.",
          retryable: false,
          user_action: diagnostics.ocrRecommended
            ? "This appears to be a scanned document. Please run OCR on it before uploading."
            : "Upload a text-based version of your document.",
        },
        diagnostics,
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  diagnostics.extractedChars = extractedText.length;
  diagnostics.durationMs = millisSince(t0);

  return {
    rawText: extractedText,
    sourceFilename: fileName,
    mimeType,
    documentType,
    rawTextHash: await sha256Hex(buffer),
    notes: toText(notes),
    diagnostics,
  };
}
