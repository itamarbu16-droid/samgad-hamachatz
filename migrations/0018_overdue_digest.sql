CREATE TABLE IF NOT EXISTS overdue_digest_runs (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
