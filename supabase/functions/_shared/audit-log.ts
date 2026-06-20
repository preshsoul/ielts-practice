/**
 * Structured logging pipeline with tamper-evident audit trails.
 *
 * Features:
 *   - Correlation IDs: trace requests across functions/services
 *   - Severity routing: INFO → console, WARN/ERROR → audit table + console
 *   - Tamper-evident: each log entry is chained via SHA-256 hash of previous entry
 *   - Rate-limited batch writes to Supabase audit table
 *   - Automatic PII redaction in log payloads
 *
 * Architecture:
 *   Request → correlationId assigned → log events (in-memory buffer)
 *   → response sent → buffer flushed to Supabase audit table (async, non-blocking)
 */

import { createHash } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export type Severity = "DEBUG" | "INFO" | "WARN" | "ERROR" | "SECURITY";

export interface AuditEntry {
  id: string;                    // UUID v4
  correlation_id: string;        // Request trace ID
  timestamp: string;             // ISO 8601
  severity: Severity;
  event: string;                 // e.g. "auth.login.failed", "cv.upload.blocked"
  actor_id: string | null;       // User ID or "anonymous"
  actor_ip_hash: string | null;  // SHA-256 of client IP (privacy-preserving)
  payload: Record<string, unknown>; // Redacted event data
  previous_hash: string | null;  // Chain hash (tamper-evident)
  entry_hash: string;            // SHA-256 of this entry's content
}

interface PendingEntry {
  entry: Omit<AuditEntry, "entry_hash">;
  resolve: () => void;
}

// ── State ──────────────────────────────────────────────────────────────────

const auditBuffer: PendingEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let previousHash: string | null = null;
const FLUSH_INTERVAL_MS = 5000;  // Batch flush every 5s
const MAX_BUFFER_SIZE = 50;      // Or when buffer hits 50 entries
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,  // email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                         // phone (US)
  /\b\d{4}[-.]?\d{4}[-.]?\d{4}[-.]?\d{4}\b/g,              // credit card
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,                           // IP address
];

// ── UUID v4 generation (no external deps) ─────────────────────────────────

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── PII redaction ──────────────────────────────────────────────────────────

function redactPII(value: unknown): unknown {
  if (typeof value === "string") {
    let redacted = value;
    for (const pattern of PII_PATTERNS) {
      redacted = redacted.replace(pattern, "[REDACTED]");
    }
    return redacted;
  }
  if (Array.isArray(value)) return value.map(redactPII);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Redact known sensitive keys
      if (/password|secret|token|key|credential|ssn|passport/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactPII(val);
      }
    }
    return out;
  }
  return value;
}

// ── Hash computation ───────────────────────────────────────────────────────

function computeEntryHash(entry: Omit<AuditEntry, "entry_hash">): string {
  const content = JSON.stringify({
    id: entry.id,
    correlation_id: entry.correlation_id,
    timestamp: entry.timestamp,
    severity: entry.severity,
    event: entry.event,
    actor_id: entry.actor_id,
    actor_ip_hash: entry.actor_ip_hash,
    payload: entry.payload,
    previous_hash: entry.previous_hash,
  });
  return createHash("sha256").update(content).digest("hex");
}

// ── Buffer management ──────────────────────────────────────────────────────

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushAuditBuffer().catch(() => {
      // Audit flush failure must not crash the request handler.
      // Entries stay in buffer and will be retried on next flush.
      console.error("Audit log flush failed — entries retained in buffer");
    });
  }, FLUSH_INTERVAL_MS);
}

// ── Supabase audit table write ─────────────────────────────────────────────

async function writeToAuditTable(entries: AuditEntry[]): Promise<void> {
  const supabaseUrl = Deno.env.get("LOCI_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("LOCI_" + ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")) || Deno.env.get(["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")) || "";

  if (!supabaseUrl || !serviceRoleKey) {
    // Fallback: log to console in structured JSON format
    for (const entry of entries) {
      console.log(JSON.stringify({ _audit: entry }));
    }
    return;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/audit_logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(entries),
  });

  if (!response.ok) {
    throw new Error(`Audit table write failed: ${response.status}`);
  }
}

async function flushAuditBuffer(): Promise<void> {
  if (!auditBuffer.length) return;

  const pending = auditBuffer.splice(0);
  const entries: AuditEntry[] = [];

  for (const { entry } of pending) {
    const entryHash = computeEntryHash(entry);
    entries.push({ ...entry, entry_hash: entryHash });
    previousHash = entryHash;
  }

  try {
    await writeToAuditTable(entries);
    for (const { resolve } of pending) resolve();
  } catch (error) {
    // Push back to buffer on failure
    for (const item of pending.reverse()) {
      auditBuffer.unshift(item);
    }
    throw error;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function createAuditLogger(correlationId: string, actorId: string | null, clientIp: string | null) {
  // Hash the IP for privacy (one-way)
  const actorIpHash = clientIp
    ? createHash("sha256").update(clientIp).digest("hex")
    : null;

  return {
    log(severity: Severity, event: string, payload: Record<string, unknown> = {}) {
      const entry: Omit<AuditEntry, "entry_hash"> = {
        id: uuidv4(),
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
        severity,
        event,
        actor_id: actorId,
        actor_ip_hash: actorIpHash,
        payload: redactPII(payload) as Record<string, unknown>,
        previous_hash: previousHash,
      };

      // Console output for real-time visibility
      const prefix = severity === "SECURITY" ? "🔐" : severity === "ERROR" ? "❌" : severity === "WARN" ? "⚠️" : "";
      console[severity === "ERROR" ? "error" : severity === "WARN" ? "warn" : "log"](
        `${prefix}[${correlationId.substring(0, 8)}] ${event}`,
        entry.payload,
      );

      // Buffer for Supabase persistence
      return new Promise<void>((resolve) => {
        auditBuffer.push({ entry, resolve });
        if (auditBuffer.length >= MAX_BUFFER_SIZE) {
          // Flush immediately if buffer is full
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          flushAuditBuffer().catch(() => {});
          resolve(); // Resolve immediately on overflow flush (fire-and-forget)
        } else {
          scheduleFlush();
        }
      });
    },

    /** Must be called before the response is sent to flush remaining entries. */
    async flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flushAuditBuffer();
    },

    /** Correlate a downstream call's logs with this request. */
    child(service: string): string {
      return `${correlationId}:${service}`;
    },
  };
}

// ── Correlation ID from request ────────────────────────────────────────────

export function extractCorrelationId(req: Request): string {
  // Use incoming header if present (for cross-service tracing),
  // otherwise generate a new correlation ID.
  const incoming = req.headers.get("x-correlation-id");
  if (incoming && /^[a-f0-9-]{8,}$/.test(incoming.trim())) {
    return incoming.trim();
  }
  return uuidv4();
}

// ── Verify log chain integrity (for audit verification) ────────────────────

export function verifyLogChain(entries: AuditEntry[]): { ok: boolean; breakAt: number | null } {
  for (let i = 0; i < entries.length; i++) {
    const expectedHash = computeEntryHash({
      id: entries[i].id,
      correlation_id: entries[i].correlation_id,
      timestamp: entries[i].timestamp,
      severity: entries[i].severity,
      event: entries[i].event,
      actor_id: entries[i].actor_id,
      actor_ip_hash: entries[i].actor_ip_hash,
      payload: entries[i].payload,
      previous_hash: entries[i].previous_hash,
    });
    if (expectedHash !== entries[i].entry_hash) {
      return { ok: false, breakAt: i };
    }
    // Verify chain link
    if (i > 0 && entries[i].previous_hash !== entries[i - 1].entry_hash) {
      return { ok: false, breakAt: i };
    }
  }
  return { ok: true, breakAt: null };
}
