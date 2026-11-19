CREATE TABLE IF NOT EXISTS custom_document_folders (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), name text NOT NULL, parent text, section text NOT NULL CHECK(section IN ('library','records')), client_request_id text NOT NULL, UNIQUE(organization_id,client_request_id));
ALTER TABLE rhythm_groups ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE rhythm_groups ADD COLUMN IF NOT EXISTS customized boolean NOT NULL DEFAULT false;
