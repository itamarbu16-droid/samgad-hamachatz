BEGIN;
CREATE TABLE IF NOT EXISTS task_pins (
 id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 user_id text NOT NULL REFERENCES auth_user(id), task_key text NOT NULL,
 UNIQUE(organization_id,user_id,task_key)
);
CREATE TABLE IF NOT EXISTS calendar_connections (
 id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 user_id text NOT NULL REFERENCES auth_user(id), encrypted_tokens text NOT NULL,
 UNIQUE(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS calendar_bookings (
 id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 user_id text NOT NULL REFERENCES auth_user(id), task_key text NOT NULL,
 event_id text NOT NULL, event_url text NOT NULL, starts_at text NOT NULL, ends_at text NOT NULL,
 UNIQUE(organization_id,user_id,task_key)
);
ALTER TABLE rhythm_occurrences ADD COLUMN IF NOT EXISTS scheduled_date date;
UPDATE rhythm_occurrences SET scheduled_date=due_date WHERE scheduled_date IS NULL;
ALTER TABLE rhythm_occurrences DROP CONSTRAINT IF EXISTS rhythm_occurrences_item_id_due_date_key;
DROP INDEX IF EXISTS rhythm_occurrence_item_date;
CREATE UNIQUE INDEX IF NOT EXISTS rhythm_occurrence_schedule ON rhythm_occurrences(item_id,COALESCE(scheduled_date,due_date));
COMMIT;
