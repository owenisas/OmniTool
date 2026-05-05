-- ============================================================================
-- 002_encryption.sql
-- Database-level encryption utilities and audit logging for sensitive data.
--
-- NOTE: The application currently handles encryption in the Node.js layer
-- using INTEGRATION_ENCRYPTION_KEY (AES-256-GCM) for connected account tokens
-- (see packages/integrations). These DB-level functions are available as an
-- additional encryption layer or for use in future DB-level triggers/policies.
-- ============================================================================

-- ─── ENABLE PGCRYPTO EXTENSION ──────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ─── ENCRYPTION HELPER FUNCTIONS ────────────────────────────────────────────

-- encrypt_sensitive(plaintext, encryption_key) -> base64-encoded ciphertext
-- Uses AES-256-CBC with PKCS padding via pgcrypto.
-- The key is hashed to 32 bytes (SHA-256) to ensure AES-256 key length.
CREATE OR REPLACE FUNCTION public.encrypt_sensitive(
  plaintext text,
  encryption_key text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  key_bytes bytea;
  encrypted bytea;
BEGIN
  -- Derive a 32-byte key from the provided key using SHA-256
  key_bytes := digest(encryption_key, 'sha256');

  -- Encrypt using AES-256-CBC with PKCS padding
  encrypted := encrypt_iv(
    convert_to(plaintext, 'UTF8'),
    key_bytes,
    substr(key_bytes, 1, 16),  -- Use first 16 bytes of key as IV (deterministic)
    'aes-cbc/pad:pkcs'
  );

  -- Return as base64 for safe text storage
  RETURN encode(encrypted, 'base64');
END;
$$;

COMMENT ON FUNCTION public.encrypt_sensitive(text, text) IS
  'AES-256-CBC encrypt plaintext with a key, returns base64-encoded ciphertext. '
  'Key is derived via SHA-256 to ensure 32-byte length.';


-- decrypt_sensitive(ciphertext_base64, encryption_key) -> plaintext
CREATE OR REPLACE FUNCTION public.decrypt_sensitive(
  ciphertext_b64 text,
  encryption_key text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  key_bytes bytea;
  decrypted bytea;
BEGIN
  -- Derive the same 32-byte key
  key_bytes := digest(encryption_key, 'sha256');

  -- Decode from base64 and decrypt
  decrypted := decrypt_iv(
    decode(ciphertext_b64, 'base64'),
    key_bytes,
    substr(key_bytes, 1, 16),  -- Same IV derivation as encrypt
    'aes-cbc/pad:pkcs'
  );

  RETURN convert_from(decrypted, 'UTF8');
END;
$$;

COMMENT ON FUNCTION public.decrypt_sensitive(text, text) IS
  'Decrypt a base64-encoded AES-256-CBC ciphertext with the same key used for encryption.';


-- ─── SENSITIVE DATA AUDIT LOG ───────────────────────────────────────────────
-- Tracks access to encrypted/sensitive fields for compliance and debugging.

CREATE TABLE IF NOT EXISTS public.sensitive_audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  accessed_by   text NOT NULL,                    -- user ID or role that accessed the data
  action        text NOT NULL,                    -- 'read', 'decrypt', 'encrypt', 'update'
  table_name    text NOT NULL,                    -- which table was accessed
  record_id     text NOT NULL,                    -- primary key of the accessed record
  column_name   text,                             -- specific column accessed (nullable)
  ip_address    inet,                             -- client IP if available
  metadata      jsonb,                            -- additional context
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by record
CREATE INDEX idx_sensitive_audit_record
  ON public.sensitive_audit_log (table_name, record_id);

-- Index for querying by user
CREATE INDEX idx_sensitive_audit_user
  ON public.sensitive_audit_log (accessed_by, created_at DESC);

-- Index for time-based queries (compliance reports)
CREATE INDEX idx_sensitive_audit_time
  ON public.sensitive_audit_log (created_at DESC);

COMMENT ON TABLE public.sensitive_audit_log IS
  'Audit trail for access to encrypted/sensitive fields. '
  'Insert a row whenever sensitive data (tokens, keys, PII) is read or modified.';

-- Enable RLS on the audit log (only postgres/service_role should write to it)
ALTER TABLE public.sensitive_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_postgres_bypass" ON public.sensitive_audit_log
  FOR ALL TO postgres USING (true) WITH CHECK (true);

CREATE POLICY "audit_log_service_role_bypass" ON public.sensitive_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- app_user can only read their own audit entries
CREATE POLICY "audit_log_read_own" ON public.sensitive_audit_log
  FOR SELECT TO app_user
  USING (accessed_by = auth.uid()::text);


-- ─── HELPER: LOG SENSITIVE ACCESS ───────────────────────────────────────────
-- Convenience function to insert an audit log entry.

CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  p_accessed_by text,
  p_action text,
  p_table_name text,
  p_record_id text,
  p_column_name text DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.sensitive_audit_log
    (accessed_by, action, table_name, record_id, column_name, ip_address, metadata)
  VALUES
    (p_accessed_by, p_action, p_table_name, p_record_id, p_column_name, p_ip_address, p_metadata);
$$;

COMMENT ON FUNCTION public.log_sensitive_access IS
  'Insert an audit log entry for sensitive data access. Call from application code or triggers.';


-- ============================================================================
-- USAGE EXAMPLES:
--
-- Encrypt a token before storing:
--   UPDATE connected_accounts
--   SET "encryptedAccessToken" = encrypt_sensitive('ghp_abc123...', 'my-secret-key')
--   WHERE id = 'record-id';
--
-- Decrypt a token for use:
--   SELECT decrypt_sensitive("encryptedAccessToken", 'my-secret-key')
--   FROM connected_accounts WHERE id = 'record-id';
--
-- Log an access event:
--   SELECT log_sensitive_access(
--     'user-cuid-123',
--     'decrypt',
--     'connected_accounts',
--     'record-cuid-456',
--     'encryptedAccessToken',
--     '192.168.1.1'::inet,
--     '{"reason": "GitHub API sync"}'::jsonb
--   );
-- ============================================================================
