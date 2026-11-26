# Optional hourly overdue reminders (disabled by default)

This feature is **not scheduled or activated by this change**. There is no workflow,
new service, migration, or change to the existing daily cron routes/vercel.json.

## Activation prerequisites (not performed here)

- `HOURLY_REMINDERS_ENABLED` must be exactly `true`.
- Independently provision `HOURLY_REMINDERS_SECRET` as 32 cryptographically random
  bytes encoded as canonical base64url (43 characters). It must differ from
  `CRON_SECRET`. Do not put it in a URL, logs, source, or browser code.
- `GET /api/cron/hourly-overdue` requires the matching bearer header. This is an
  **active delivery operation**, not a health check. HEAD returns 405. Disabled,
  malformed-secret and unauthorized requests do not import the worker or touch DB.
- No scheduler is configured. Plan/deployment eligibility must be verified before
  connecting a scheduler. Retries must be within the current UTC hour. Successful
  provider acceptance is not proof that a phone displayed a notification.

## Scope and privacy

Only existing subscribed devices belonging to a currently active, explicitly
permitted, unambiguous member with task-writing capability are eligible. Reminders
cover the recipient's own open/in-progress/blocked dated legacy tasks and own
assigned nonarchived one-off rhythm tasks, overdue by the Israel calendar date.
Existing company/domain visibility restrictions are retained. Points, recurring
checklists, undated/future tasks, completed/cancelled work, and reported completion
awaiting approval are excluded. Any valid assignee report/completion stops a shared
reminder. There is no automatic manager copy and no email/SMS fallback.

Messages carry only a count and a link into the authenticated application. Task
names and other people's identities never enter hourly push text. The endpoint
returns counts only, including `remaining` resumable current-hour slots (not a
guarantee of current eligibility; each is revalidated at dispatch) (503 when a provider attempt fails, so callers may retry
within the same slot). Web Push remains an empty wakeup; the worker fetches event data
under the device's current session. An expired session can show only the existing
generic prompt to open the application.

## Deduplication, expiry, and compatibility

- Reuse `overdue_digest_runs` as a prefixed idempotency/device-receipt ledger.
  Only hashed, namespaced keys for queued slots, attempts, sent state, device receipts
  and acknowledgements are stored. There are no hourly writes to `push_events`.
  Stable keys include organization, assignee, and UTC hour. Acknowledgement does
  not permit recreation during the same hour. This feature prunes only its own
  receipts after 35 days; daily ledger behavior is unchanged.
- At most one current-hour logical event per assignee, synthesized from the exact
  current-slot ledger key and freshly revalidated task counts. Older keys cannot
  be read as current notifications or drained later. Disabled deployments hide
  hourly state without deleting an enabled deployment's current-hour work.
- Mixed immutable deployments sharing a database are safe: old `pendingPush`,
  `flushPush` and acknowledgement only operate on `push_events`, which contains
  no hourly records. Their daily ledger cleanup removes records older than 35
  days and cannot erase fresh slots. Ordinary flushing remains unchanged.
- Ordinary reads retain their existing 20 events. At most one validated hourly
  event is appended (acknowledgement accepts 21), never replacing an ordinary item.
  Current assignment, permission, and completion are checked again before showing
  hourly text and before sending. Previously displayed OS notifications cannot be
  remotely guaranteed to disappear when a task changes.
- Hourly sends use a separate stable Topic and notification tag; only previous
  hourly notifications are coalesced. TTL ends at the UTC-hour boundary.
- Dedicated worker processes up to 50 events or 45 seconds of sending per call.
  Slot advisory transaction locks prevent concurrent claims; per-device receipts
  avoid resending accepted devices when another device fails. No permanent
  sent-at claim is written before network work. A crash after provider acceptance
  but before commit can still cause a retry; exactly-once Web Push is not promised. Acknowledgement is user-level, so one
  device may acknowledge before another fetches details; all-device display is not
  guaranteed. An already accepted empty wake can still show the existing generic
  app prompt after a task is completed, but no stale overdue count or title.
- There are at most five attempts per slot. A new invocation within the hour can
  retry transient errors/drain remaining slots. Completed, acknowledged or attempt-capped
  slots do not consume the next batch limit. A single hourly invocation does not
  guarantee delivery to more than 50 recipients; the caller must drain batches
  within the hour. The next hour starts fresh rather
  than delivering accumulated stale reminders. Do not describe the off-by-default
  backend as a working hourly schedule until invocation/delivery is verified.

Tests use only isolated synthetic databases, fabricated subscriptions and mocked
network transport. Never test this active endpoint against live user data without
separate task authorization.

Subscriptions do not record the browser application origin/version. A subscribed
old-origin service worker may receive only the existing generic application prompt
because its API cannot see hourly ledger keys. Updating the current preview alone
cannot guarantee hourly detail display in all previously installed applications.
This does not let an old deployment read or flush hourly notification data.

## Optional Vercel Schedules path adapter

A separate POST supports the provider's path target using the existing Vercel
`CRON_SECRET`. Like the standalone path, it is disabled without
`HOURLY_REMINDERS_ENABLED=true`. The POST accepts only the intended Git Preview
branch, authenticated static scheduled runs named `hourly-overdue-assignees`,
and the current UTC hour. Old catch-up runs and future slots do not dispatch.
The matching static declaration checks twice each hour to allow bounded retries
and backlog drainage; the persistent per-assignee/hour claim still delivers at
most one reminder. Its feature flag is unset by default and Vercel registers new
Preview schedules inactive. Check the provider dashboard and active Preview
deployment before enabling the flag or schedule; legacy jobs are not changed.

Do not manually invoke the activated route against live data to prove plumbing.
Use isolated fixtures to verify errors, scope, and delivery selection, then
observe the first actual scheduled execution by aggregate counters only.
