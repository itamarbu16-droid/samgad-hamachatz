# Release gates and verification record

This document distinguishes intended acceptance criteria from executed verification. An unchecked item is not a passing result.

## Phase 1 acceptance gates

- [x] Type checking, linting, relevant automated tests, and production build pass locally.
- [x] A seeded synthetic user signs in through the actual authentication flow.
- [x] A task is created with a valid owner and deadline, survives reload, advances through valid statuses, and records completion.
- [x] The dashboard overdue count reconciles after task creation and completion.
- [x] A decision request is submitted, resolved by its authorized decision maker, and retains its outcome/history after reload.
- [x] Anonymous API access is rejected; read-only users cannot mutate records.
- [x] Company-scoped collections and activity omit other-company tasks; cross-company task writes and creation are denied through direct API calls.
- [x] Desktop and mobile browser checks confirm document RTL and no horizontal overflow on the dashboard and creation dialog.
- [ ] Complete the broader invalid-input, failure-recovery, concurrency, and permission acceptance matrix beyond the covered automated cases.
- [ ] Desktop and mobile browser checks confirm RTL, visible labels, keyboard focus, no horizontal overflow, and readable long Hebrew content.
- [ ] A real Vercel preview reaches ready status and the critical workflows pass against its isolated persistent database.

## Verification record

| Check | Result | Scope |
| --- | --- | --- |
| `npm run typecheck` | Passed, 2026-10-13 | Local TypeScript compilation; does not establish runtime behavior. |
| `npm run lint` | Passed, 2026-10-13 | ESLint checks on the final local source. |
| `npm test` | 16/16 passed, 2026-10-13 | Local backend policy, validation, and persistence checks; final run confirmed by the coordinating engineer. |
| `npm run build` | Passed, 2026-10-13 | Production compilation after the dependency-tracing fix; local production server started with `npm start`. |
| Playwright E2E suite (`npm run test:e2e`) | 16/16 passed in 1.2 minutes, 2026-10-13 | Desktop Chromium and Pixel 7 browser projects against the local production server and persistent synthetic PGlite database. |
| `npm audit` | 0 reported vulnerabilities, 2026-10-13 | Dependency advisory snapshot; not an independent security audit. |

The final browser run verifies real form login and session persistence; task creation, reload, progress note, completion, and overdue-count reconciliation; decision submission and resolution with persisted audit presence; anonymous and viewer denial; company isolation; origin rejection; and RTL viewport fit. Screenshots are generated for desktop and mobile dashboard inspection.

Earlier development runs encountered a transient missing component during an in-progress file split, exact-label selector mismatches, and sign-in rate limits. The final run passed after those issues were corrected. Authentication fixtures honor bounded `Retry-After` responses; application rate limiting remains enabled. These are local smoke and integration results, not a completed hosted acceptance test, accessibility certification, usability study, load test, or security approval.

## External deployment status

Initially the Vercel connector authenticated as `itamarbu16-8051`, but its default team scope (`itamar14`) returned HTTP 403. After the user reconnected it, plugin metadata reported installed/enabled while project, team, and authentication tool calls returned `Unknown tool`. The resource connection is therefore currently unavailable. No managed database or hosted preview has been provisioned and no deployment success is claimed. No production deployment approval was requested. GitHub work is restricted to `itamarbu16-droid/samgad-hamachatz`.

## Production prerequisites

Production is a separate approval decision. Synthetic preview readiness is not authorization for real organizational use.

- Provision a separate managed database; apply reviewed migrations and validate recovery from a backup.
- Configure strong environment secrets and the approved identity/account lifecycle, including session revocation and removal of demo credentials.
- Review server authorization across all entry points and test organizational, company, domain, and assignment isolation.
- Complete an information-security and data-handling review; define allowed information, retention, audit access, incident response, and support ownership.
- Establish monitoring, sanitized logging, rate limiting, rollback procedure, and dependency maintenance.
- Confirm preview and production do not share data or secrets. Never seed synthetic demo accounts automatically into production.

## Deferred acceptance journeys

Administrative incident-to-task follow-up, in-app notifications, Excel/PDF exports, reporting-period filters, permission administration, and approved automation require subsequent implementation and tests. No acceptance claim is made for these workflows in the foundation release.
