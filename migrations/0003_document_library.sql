BEGIN;
CREATE TABLE IF NOT EXISTS document_entries (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  folder_id text NOT NULL,
  creator_id text NOT NULL REFERENCES auth_user(id),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  document_date date,
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_entries_org_folder ON document_entries(organization_id, folder_id, archived);
CREATE TABLE IF NOT EXISTS document_attachments (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES document_entries(id),
  filename text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 3145728),
  content_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_attachments_entry ON document_attachments(entry_id);
COMMIT;
