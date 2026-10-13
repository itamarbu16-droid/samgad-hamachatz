# Architecture and delivery plan

## Scope and repository baseline

The repository was inspected on 2026-10-13. It contained its initial README and Git metadata, with no application, package manifest, tests, CI, database configuration, or established deployment. Its origin is `itamarbu16-droid/samgad-hamachatz`.

The first delivery is a complete administrative task and decision vertical slice. It is intended for fictional organizations and synthetic records. It is not an operational command application, personnel tracker, or approved repository for real sensitive information.

## Initial implementation sequence

1. Establish Next.js App Router, TypeScript, a Hebrew RTL root, shared visual tokens, and responsive navigation.
2. Establish persistent organization, company, user, domain, task, decision, session, and audit storage with a reproducible schema and synthetic seed.
3. Use a maintained authentication library. Resolve identity from the server session and permissions from persisted membership; never accept role claims from the client.
4. Deliver task creation, scoped retrieval, validated lifecycle changes, ownership, deadlines, and audit history.
5. Derive dashboard metrics from the same scoped records and definitions used by task lists. Link attention counts to filtered views.
6. Deliver decision submission and authorized resolution with an auditable outcome.
7. Verify server authorization, persistence, browser workflows, mobile layout, and production compilation before expanding into later phases.
8. Configure an isolated managed database and Vercel preview only after the required credentials and integration are available. A local build does not establish deployment success.

## Security boundaries

- Every authenticated request resolves its actor server-side. Collection and record access must apply organization and company/domain/assignment scope before returning data.
- A known record ID is not permission to read or mutate it. Export, search, activity, dashboard, and notification queries require the same scope as the source record.
- Assignment validation must ensure the proposed owner can operate within the record's organization and scope.
- Read-only membership must not acquire write capability through a direct API call.
- Mutation input is validated server-side; IDs, timestamps, actor identity, and audit events are owned by the server.
- Audit writes and domain changes should share a transaction. No public mutation API should update or remove audit entries.
- Real deployment requires an independently reviewed authentication configuration, secret handling, logging, recovery, retention, rate limiting, and organizational data-handling approval.

## Metric and date contracts

Open work excludes completed and cancelled tasks. Overdue work is unfinished work with a due date before the current calendar date in `Asia/Jerusalem`; a task due today is not overdue. Completion belongs to the recorded completion timestamp. Do not maintain overdue as a separately editable status.

Calendar-only deadlines should retain their date semantics across timezones. Store event timestamps as UTC instants and present them in the configured user-facing timezone. Use the same definitions for lists, dashboard summaries, and future reports.

## Progressive scope

Phase 1 establishes authenticated tasks, persisted metrics, basic decisions, and critical audit history. Subsequent slices add administrative review follow-up, notifications, broader search and permission administration, then reporting and Hebrew exports. AI and external messaging are not dependencies of the initial slice. Planned features must not appear as enabled controls without a functioning workflow.

## Pending infrastructure decisions

Managed database provisioning, preview/production separation, hosting account ownership, backup/restore testing, and security approval must be resolved from actual connected resources. No existing service or successful deployment is assumed here.

## Foundation implementation choices

The application uses Better Auth with its Drizzle adapter and email/password sessions; public signup is disabled. PostgreSQL is the managed deployment target. PGlite provides a persistent PostgreSQL-compatible local demonstration database only when `DEMO_MODE=true`, no `DATABASE_URL` exists, and the process is not on Vercel. The server refuses an implicit filesystem fallback on Vercel.

The initial SQL migration defines data-integrity constraints and an audit update/delete prevention trigger. Drizzle schema types and the SQL migration must be kept aligned; production schema changes require a migration rather than editing an already-applied file.

The first membership representation supports one company constraint and one domain constraint per organization membership. Arbitrary multiple-company or multiple-domain grants need a subsequent membership/grant model; do not describe this foundation as supporting unrestricted policy configuration.

Authentication identifies a user; `principalFor` requires exactly one active organization membership. Multiple-organization switching is not yet implemented. Managers can manage records within their scope; contributors can operate on assigned tasks and their own decision requests. Viewers cannot write. System administrators do not automatically receive access to administrative record content.

Task changes use optimistic concurrency through a required version number; conflicting writes return 409. Task and decision mutations create audit entries in the same database transaction. Scope is applied before database retrieval, including comments and activity. Mutation routes check the request origin against the configured application origin and accept JSON only.

The current database connection is a server-only application connection, with authorization implemented in the service query layer. PostgreSQL row-level security policies are not part of this foundation. Before real-use deployment, review a least-privilege application database role and defense-in-depth RLS; database constraints alone do not enforce user-level authorization. Direct database credentials must never reach a browser or a client-facing connector.

The workspace currently loads the authorized task set and up to 100 recent activity records. Pagination and complete per-record history queries are required before claiming suitability for large datasets or exhaustive historical audit browsing.

Browser verification uses Playwright desktop and Pixel 7 projects against an explicitly running local server. Credentials are loaded from private local environment configuration, never fixtures committed to Git.
