BEGIN;
ALTER TABLE document_attachments DROP CONSTRAINT IF EXISTS document_attachments_byte_size_check;
ALTER TABLE document_attachments DROP CONSTRAINT IF EXISTS document_attachments_size;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_size CHECK(byte_size > 0 AND byte_size <= 26214400);
CREATE TABLE IF NOT EXISTS document_uploads (
 id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 creator_id text NOT NULL REFERENCES auth_user(id), filename text NOT NULL,
 byte_size integer NOT NULL CHECK(byte_size > 0 AND byte_size <= 26214400),
 consumed_by text, expires_at timestamptz NOT NULL,
 touched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_uploads_owner ON document_uploads(organization_id,creator_id);
CREATE TABLE IF NOT EXISTS document_upload_chunks (
 id text PRIMARY KEY, upload_id text NOT NULL REFERENCES document_uploads(id) ON DELETE CASCADE,
 chunk_index integer NOT NULL CHECK(chunk_index >= 0 AND chunk_index < 25),
 content_base64 text NOT NULL, UNIQUE(upload_id,chunk_index)
);
COMMIT;
