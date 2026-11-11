BEGIN;
CREATE TABLE IF NOT EXISTS rhythm_groups (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  creator_id text NOT NULL REFERENCES auth_user(id),
  name text NOT NULL,
  emails jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS rhythm_items (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  creator_id text NOT NULL REFERENCES auth_user(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  important boolean NOT NULL DEFAULT false,
  manual_urgent boolean NOT NULL DEFAULT false,
  frequency text NOT NULL CHECK (frequency IN ('once','daily','weekly','fortnightly','monthly','quarterly','semiannual','annual')),
  start_date date NOT NULL,
  end_date date,
  completion_mode text NOT NULL CHECK (completion_mode IN ('individual','shared')),
  assignee_ids jsonb NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rhythm_items_org ON rhythm_items(organization_id);
CREATE TABLE IF NOT EXISTS rhythm_occurrences (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES rhythm_items(id),
  due_date date NOT NULL,
  completions jsonb NOT NULL DEFAULT '{}',
  completed_by text REFERENCES auth_user(id),
  completed_at timestamptz,
  urgent boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  UNIQUE(item_id, due_date)
);
CREATE TABLE IF NOT EXISTS rhythm_mail (
  id text PRIMARY KEY,
  occurrence_id text NOT NULL REFERENCES rhythm_occurrences(id),
  recipient_id text NOT NULL REFERENCES auth_user(id),
  kind text NOT NULL CHECK (kind IN ('assigned','deadline')),
  sent_at timestamptz,
  skipped_at timestamptz,
  claimed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb,
  first_attempt_at timestamptz,
  UNIQUE(occurrence_id, recipient_id, kind)
);
COMMIT;
