BEGIN;
ALTER TABLE rhythm_items ADD COLUMN IF NOT EXISTS has_deadline boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS rhythm_undo (
  id text PRIMARY KEY, organization_id text NOT NULL, actor_id text NOT NULL,
  kind text NOT NULL, entity_id text NOT NULL, snapshot jsonb NOT NULL,
  expected_version integer NOT NULL, expires_at timestamptz NOT NULL
);
COMMIT;
