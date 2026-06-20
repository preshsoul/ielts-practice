-- Tamper-evident audit log table
-- Each entry is chained to the previous via SHA-256 hash.
-- The chain can be verified with verifyLogChain() in audit-log.ts.

CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY,
  correlation_id  TEXT NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity        TEXT NOT NULL CHECK (severity IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'SECURITY')),
  event           TEXT NOT NULL,                      -- e.g. 'auth.login.failed'
  actor_id        UUID,                               -- profiles.id or null for anonymous
  actor_ip_hash   TEXT,                               -- SHA-256 of client IP
  payload         JSONB NOT NULL DEFAULT '{}',        -- Redacted event data
  previous_hash   TEXT,                               -- SHA-256 of previous entry (chain link)
  entry_hash      TEXT NOT NULL,                      -- SHA-256 of this entry's content

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for correlation ID lookups (trace a single request)
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation ON audit_logs (correlation_id);

-- Index for event-type queries (e.g. "all failed logins")
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs (event, timestamp DESC);

-- Index for actor queries (e.g. "all events for user X")
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id, timestamp DESC)
  WHERE actor_id IS NOT NULL;

-- Index for severity queries (e.g. "all SECURITY events in last 24h")
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs (severity, timestamp DESC);

-- Enable RLS: only service_role can read/write audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access to audit logs
CREATE POLICY "audit_logs_service_role_only"
  ON audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-cleanup: delete entries older than 90 days
-- (Uncomment to enable retention policy)
-- CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
-- RETURNS void AS $$
-- BEGIN
--   DELETE FROM audit_logs WHERE timestamp < now() - INTERVAL '90 days';
-- END;
-- $$ LANGUAGE plpgsql;

-- Verify chain integrity for a given correlation ID
CREATE OR REPLACE FUNCTION verify_audit_chain(correlation_id_in TEXT)
RETURNS TABLE (
  entry_index BIGINT,
  entry_id UUID,
  hash_valid BOOLEAN,
  chain_link_valid BOOLEAN
) AS $$
DECLARE
  prev_hash TEXT := NULL;
  rec RECORD;
  idx BIGINT := 0;
  computed_hash TEXT;
BEGIN
  FOR rec IN
    SELECT * FROM audit_logs
    WHERE correlation_id = correlation_id_in
    ORDER BY timestamp ASC, created_at ASC
  LOOP
    -- Compute expected hash
    computed_hash := encode(
      digest(
        json_build_object(
          'id', rec.id,
          'correlation_id', rec.correlation_id,
          'timestamp', rec.timestamp,
          'severity', rec.severity,
          'event', rec.event,
          'actor_id', rec.actor_id,
          'actor_ip_hash', rec.actor_ip_hash,
          'payload', rec.payload,
          'previous_hash', rec.previous_hash
        )::text,
        'sha256'
      ),
      'hex'
    );

    entry_index := idx;
    entry_id := rec.id;
    hash_valid := computed_hash = rec.entry_hash;
    chain_link_valid := CASE
      WHEN idx = 0 THEN prev_hash IS NULL  -- First entry: previous_hash must be NULL
      ELSE rec.previous_hash = prev_hash   -- Subsequent: must chain to previous
    END;

    RETURN NEXT;
    prev_hash := rec.entry_hash;
    idx := idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
