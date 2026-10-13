# סמג״ד המחץ

Hebrew-first, native RTL administrative task and decision management. Development and demonstrations use fictional organizations and synthetic data only.

This repository is the Phase 1 foundation: authentication, scoped tasks, database-derived dashboard metrics, basic decisions, and audit history. See [architecture](docs/ARCHITECTURE.md) for the initial plan and [release gates](docs/RELEASE.md) for verified results, limitations, and work still required. This is not an approved system for real military, personnel, medical, classified, or operational information.

## Stack

Next.js App Router and TypeScript; Better Auth for email/password sessions; Drizzle with PostgreSQL. Explicit local demo mode can use persistent PGlite storage when a managed PostgreSQL URL is not configured. Vercel requires an external PostgreSQL database; local filesystem storage is not a deployment database.

## Local setup

Install dependencies with `npm ci`. Copy `.env.example` to `.env.local` and fill in private values. Keep all actual credentials and local database files out of Git.

Required configuration:

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Random private secret of at least 32 characters; never commit it. |
| `BETTER_AUTH_URL` | Application origin, such as `http://127.0.0.1:3000` locally. |
| `DATABASE_URL` | PostgreSQL connection string; required outside explicit local demo mode and on Vercel. |
| `DEMO_MODE` | Set to `true` only for the synthetic demonstration environment. |
| `DEMO_PASSWORD` | Private password for provisioned synthetic accounts; at least 12 characters. |
| `PGLITE_DATA_DIR` | Optional local PGlite directory; defaults to `.data/postgres`. |

Run `npm run db:setup` to initialize the schema and synthetic environment, then `npm run dev`. Sign in with the seeded `demo@samgad.example` account and the password you configured. Do not publish the password in the public repository. Stop the app before using a separate local process against the same PGlite data directory.

The seed is idempotent and preserves existing accounts and records. Changing `DEMO_PASSWORD` later does not reset an existing account's password. Scoped synthetic accounts (`company.a@samgad.example`, `company.b@samgad.example`, `contributor@samgad.example`, and `viewer@samgad.example`) use the password supplied when first provisioned.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests require a running application backed by an isolated seeded synthetic database, Playwright's configured browser, and `DEMO_PASSWORD` in the test process environment. They intentionally fail when credentials are missing rather than silently skipping authentication. Tests create synthetic records; never point them at a real-use database. The release document records what has actually run; the presence of commands or tests is not evidence that they passed.

## Vercel preview

Provision an isolated managed PostgreSQL database, set the application origin and a unique auth secret in preview environment variables, apply the schema, and provision synthetic accounts deliberately. The current seed script intentionally refuses managed-database and Vercel environments; hosted account provisioning needs a reviewed explicit workflow. For schema-only setup use `DEMO_MODE=false`. Do not enable filesystem PGlite on Vercel. Confirm deployment status and exercise login, persistence, and authorization against the actual preview before declaring it ready.

Production needs separate resources, reviewed authentication/account management, backup and restore validation, monitoring, and the appropriate information-security approval. No AI provider or external messaging integration is enabled by this foundation.
