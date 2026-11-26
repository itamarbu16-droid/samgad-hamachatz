CREATE TABLE IF NOT EXISTS deadline_requests (
 id text PRIMARY KEY, organization_id text NOT NULL, requester_id text NOT NULL REFERENCES auth_user(id),
 kind text NOT NULL, task_id text NOT NULL, occurrence_id text, title text NOT NULL,
 original_date date, requested_date date NOT NULL, reason text NOT NULL, status text NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, resolved_by text REFERENCES auth_user(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS deadline_request_pending ON deadline_requests(organization_id,requester_id,kind,task_id,coalesce(occurrence_id,'')) WHERE status='pending';
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id text PRIMARY KEY, organization_id text NOT NULL, user_id text NOT NULL REFERENCES auth_user(id),
 endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_events (
 id text PRIMARY KEY, organization_id text NOT NULL, recipient_id text NOT NULL REFERENCES auth_user(id),
 title text NOT NULL, body text NOT NULL, url text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS expired_task_records (
 task_key text PRIMARY KEY, expired_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_config (organization_id text PRIMARY KEY, public_key text NOT NULL, encrypted_private_key text NOT NULL);
