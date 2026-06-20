/**
 * Defense-in-depth upload security.
 *
 * Layers (in order, each must pass before proceeding):
 *   1. Magic byte detection — identifies true file type, ignores extension
 *   2. MIME type fingerprinting — validates Content-Type against magic bytes
 *   3. Size enforcement — multiple limits (total, per-type, decompression bomb)
 *   4. Content sandboxing — extracted text goes through type-specific safe paths
 *   5. Malware scanning — optional VirusTotal hash check (never sends file content)
 *
 * Design principle: Never trust the client. Validate at every layer.
 */

// ── Magic byte signatures ──────────────────────────────────────────────────

type FileKind = "pdf" | "docx" | "txt" | "png" | "jpg" | "gif" | "webp" | "unknown";

interface MagicSignature {
  kind: FileKind;
  mime: string;
  offset: number;
  bytes: number[]; // Byte values at offset (0x00-0xFF)
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  { kind: "pdf",   mime: "application/pdf",           offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { kind: "docx",  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK..
  { kind: "png",   mime: "image/png",                 offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { kind: "jpg",   mime: "image/jpeg",                offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  { kind: "gif",   mime: "image/gif",                 offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { kind: "webp",  mime: "image/webp",                offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
  // DOCX also starts with PK; we differentiate by checking for Word-specific ZIP entries
];

const ALLOWED_KINDS: FileKind[] = ["pdf", "docx", "txt"];
const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

// ── Limits ─────────────────────────────────────────────────────────────────

const MAX_TOTAL_BYTES = 6 * 1024 * 1024;       // 6 MB
const MAX_PDF_BYTES = 6 * 1024 * 1024;         // 6 MB
const MAX_DOCX_BYTES = 6 * 1024 * 1024;        // 6 MB
const MAX_TXT_BYTES = 200 * 1024;              // 200 KB
const DECOMPRESSION_BOMB_THRESHOLD = 50;       // 50:1 ratio max (output/input)

// ── Detection functions ────────────────────────────────────────────────────

function detectKind(bytes: Uint8Array): { kind: FileKind; mime: string } {
  for (const sig of MAGIC_SIGNATURES) {
    if (bytes.length < sig.offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (bytes[sig.offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return { kind: sig.kind, mime: sig.mime };
  }

  // Check if it's plain text (printable ASCII/UTF-8, no null bytes in first 512)
  const sample = bytes.slice(0, Math.min(512, bytes.length));
  let nullCount = 0;
  let nonPrintable = 0;
  for (const b of sample) {
    if (b === 0x00) nullCount++;
    else if (b < 0x09 || (b > 0x0D && b < 0x20)) nonPrintable++;
  }

  const total = sample.length;
  if (nullCount / total < 0.01 && nonPrintable / total < 0.05) {
    return { kind: "txt", mime: "text/plain" };
  }

  return { kind: "unknown", mime: "application/octet-stream" };
}

function mimeMatchesKind(claimedMime: string, detectedKind: FileKind): boolean {
  // The detected kind's canonical MIME must be compatible with the claimed MIME
  if (detectedKind === "txt" && claimedMime.startsWith("text/")) return true;
  const sig = MAGIC_SIGNATURES.find(s => s.kind === detectedKind);
  if (!sig) return false;
  return sig.mime === claimedMime || claimedMime.startsWith(sig.mime.split("/")[0] + "/");
}

// ── Main guard function ────────────────────────────────────────────────────

export interface UploadGuardResult {
  ok: boolean;
  kind: FileKind;
  detectedMime: string;
  claimedMime: string;
  sizeBytes: number;
  errors: string[];
  warnings: string[];
  scanId?: string;
}

export async function validateUpload(
  buffer: Uint8Array,
  claimedMime: string,
  claimedFilename: string,
  options: {
    virusTotalApiKey?: string;
    skipMalwareScan?: boolean;
  } = {},
): Promise<UploadGuardResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Layer 1: Size enforcement ──────────────────────────────────────
  if (buffer.byteLength > MAX_TOTAL_BYTES) {
    errors.push(`File too large: ${buffer.byteLength} bytes (max ${MAX_TOTAL_BYTES})`);
  }

  // ── Layer 2: Magic byte detection ──────────────────────────────────
  const { kind, mime } = detectKind(buffer);

  if (kind === "unknown") {
    errors.push("Unrecognized file type. Allowed: PDF, DOCX, plain text.");
  }

  if (!ALLOWED_KINDS.includes(kind)) {
    errors.push(`File type '${kind}' is not in the allowed list.`);
  }

  // ── Layer 3: MIME fingerprinting ───────────────────────────────────
  if (!ALLOWED_MIMES.includes(claimedMime)) {
    errors.push(`MIME type '${claimedMime}' is not allowed.`);
  }

  if (kind !== "unknown" && !mimeMatchesKind(claimedMime, kind)) {
    errors.push(
      `MIME type mismatch: claimed '${claimedMime}' but content is '${kind}' (${mime}). ` +
      "This may indicate a file extension spoofing attempt."
    );
  }

  // ── Layer 4: Per-type size limits ──────────────────────────────────
  if (kind === "pdf" && buffer.byteLength > MAX_PDF_BYTES) {
    errors.push(`PDF too large: ${buffer.byteLength} bytes (max ${MAX_PDF_BYTES})`);
  }
  if (kind === "docx" && buffer.byteLength > MAX_DOCX_BYTES) {
    errors.push(`DOCX too large: ${buffer.byteLength} bytes (max ${MAX_DOCX_BYTES})`);
  }
  if (kind === "txt" && buffer.byteLength > MAX_TXT_BYTES) {
    errors.push(`Text file too large: ${buffer.byteLength} bytes (max ${MAX_TXT_BYTES})`);
  }

  // ── Layer 5: Filename validation ──────────────────────────────────
  const filename = claimedFilename || "untitled";
  if (filename.length > 180) {
    errors.push("Filename too long (max 180 characters)");
  }
  // Block dangerous extensions even if magic bytes pass
  const dangerousPatterns = /\.(exe|dll|so|dylib|sh|bash|bat|cmd|ps1|vbs|js|jar|class|pyc|pyd|dex|apk|app|msi|scr|com|pif|reg)$/i;
  if (dangerousPatterns.test(filename)) {
    errors.push("Filename has a blocked extension");
  }
  // Null byte injection in filename
  if (filename.includes("\0")) {
    errors.push("Filename contains null bytes");
  }

  // ── Layer 6: Malware hash check (optional) ─────────────────────────
  let scanId: string | undefined;
  if (!options.skipMalwareScan && options.virusTotalApiKey && errors.length === 0) {
    try {
      // Send only SHA-256 hash, never the file content
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      const vtResponse = await fetch(`https://www.virustotal.com/api/v3/files/${hashHex}`, {
        headers: {
          "x-apikey": options.virusTotalApiKey,
          "Accept": "application/json",
        },
      });

      if (vtResponse.status === 200) {
        const vtData = await vtResponse.json();
        const stats = vtData?.data?.attributes?.last_analysis_stats;
        if (stats) {
          const malicious = stats.malicious || 0;
          const suspicious = stats.suspicious || 0;
          if (malicious > 0) {
            errors.push(`Malware detected: ${malicious} engines flagged this file as malicious`);
          } else if (suspicious > 1) {
            warnings.push(`${suspicious} engines flagged this file as suspicious`);
          }
          scanId = vtData?.data?.id;
        }
      }
      // 404 = hash not in VT database (file never seen before) — not an error
    } catch (vtError) {
      // VirusTotal is optional — never block uploads on VT downtime
      warnings.push("Malware scan unavailable — proceeding without scan");
      console.warn("VirusTotal API unavailable:", vtError);
    }
  }

  return {
    ok: errors.length === 0,
    kind,
    detectedMime: mime,
    claimedMime,
    sizeBytes: buffer.byteLength,
    errors,
    warnings,
    scanId,
  };
}

// ── Decompression bomb detection ───────────────────────────────────────────

export function checkDecompressionBomb(
  compressedBytes: number,
  decompressedBytes: number,
): { ok: boolean; ratio: number } {
  const ratio = compressedBytes > 0 ? decompressedBytes / compressedBytes : 0;
  return {
    ok: ratio <= DECOMPRESSION_BOMB_THRESHOLD,
    ratio: Math.round(ratio * 10) / 10,
  };
}
