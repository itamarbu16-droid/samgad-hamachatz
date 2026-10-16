# Task actions and Google Calendar

## Behavior

- The task card follows the finger horizontally using animation-frame DOM updates, without per-move React rendering. Child implicit-capture loss is ignored, so starting a swipe on a task button does not cancel it. Interrupted animations resume from their rendered position; release velocity and a shorter return threshold make opening and closing easier. Action rails remain visible during the closing transition. The card snaps open to expose colored action buttons underneath: orange pin/unpin and authorized red delete on a physical rightward swipe; blue deadline extension and green calendar on a leftward swipe. Vertical scrolling is preserved. The ellipsis button opens an accessible actions dialog with the same operations, including editing and archiving where permitted. Only one card remains open; touching outside, swiping back, Escape, or saving closes it. Swiping alone never deletes a task.
- Pins persist per workspace/user/task and take precedence over the selected sort order. One user's pins do not affect anyone else's list.
- Managers or task creators may delete tasks. Assigned contributors may update their deadlines, but cannot delete a task created by their manager. Deletion hides the task and offers 60 seconds to undo; recurring deletion explicitly covers the series. Completed legacy tasks can also be deleted and restored with their completion state intact.
- A recurring deadline extension changes only one occurrence. Its immutable scheduled date remains its identity, so subsequent calendar reads do not recreate the original occurrence.
- Task deletion and deadline extension do not silently delete or move an event already added to Google Calendar.

Cards share a readable title/owner/deadline hierarchy, restrained status colors, 44px minimum action targets and visible keyboard focus. Search remains visible while secondary filters and sorting are collapsed in a native disclosure.

## Calendar setup — required before real account connection

The feature is implemented, but the current Vercel project has no Google Calendar OAuth client configuration. No user's calendar is connected and no live event has been created during development.

1. In the Google Cloud project used for this application, enable Google Calendar API and configure the OAuth consent screen.
2. Create a **Web application** OAuth client. Register the exact canonical application origin plus `/api/calendar/callback` as an authorized redirect URI. It must match the `appUrl()`/`BETTER_AUTH_URL` used by the running deployment. Use a stable application origin; do not register a changing deployment URL for everyday use.
3. Configure `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` in Vercel for the intended preview branch/environment. Keep the client secret in environment settings; do not paste it into chat or commit it. Redeploy after setting these values.
4. If the consent app is in testing, add the intended Google accounts as test users. Complete any Google verification required for the requested scopes before wider release.
5. Each permitted app user opens **היומן שלי → חבר Google Calendar** and explicitly authorizes their own account. Calendar authorization does not grant application membership.

Requested scopes: `calendar.events.freebusy`, `calendar.calendarlist.readonly`, and `calendar.events`. Tokens and refresh tokens are encrypted on the server with AES-256-GCM using a key derived from the authentication secret. Rotating that secret requires users to reconnect. Tokens never enter browser storage or API responses.

## Availability and booking

The app checks all readable calendars returned by the authorized Google account, not merely the destination primary calendar. Missing or failed busy data blocks booking. Searches respect task duration, selected days/hours, current time and the Asia/Jerusalem timezone, including daylight-saving changes. Three candidate slots are shown; the user chooses one. Availability is checked again immediately before insertion; no existing event is moved.

A database lock serializes bookings from the same app user. Deterministic Google event IDs and account-specific booking records recover retries after lost responses without creating duplicate events. Bookings belong to the actual connected primary-calendar identity, so connecting another Google account does not return old-account results. Existing provider events are reconciled with their actual times.

Google Calendar does not provide an atomic free/busy-check-and-insert operation. An unrelated calendar client can still change events between the last check and insertion; this cannot be prevented by this app's database lock.

## Validation

Automated tests use an isolated synthetic database and mocked Google HTTP responses. They cover personal pin isolation/sorting, permissions, optimistic versions, deleting completed work, undo, independent recurrence extension without duplicate regeneration, OAuth state account binding, encrypted tokens, failed availability checks, booking retry recovery, account changes, boundaries and Jerusalem DST. No real calendar credentials or events were used. Gesture intent, snap thresholds, permission-dependent action widths, server-rendered inert rails, and the keyboard dialog alternative are covered by additional automated tests. Physical touch/Safari and real OAuth consent remain unverified.

Official API references: https://developers.google.com/identity/protocols/oauth2/web-server and https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query .
