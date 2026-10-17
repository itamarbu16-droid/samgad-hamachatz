# Usability and readability QA — 2026-10-15

Two independent QA reviewers inspected the manager and deputy interfaces, their task flows, shared styles, route handling and permission boundaries. Reviews were source-based; authenticated browser, Safari and device testing was unavailable. This is not a claim of full visual or assistive-technology certification.

## Resolved findings

- Status row foregrounds retained colors from the previous light theme. Explicit bright foregrounds now provide calculated contrast of 12.45–13.17:1 against the dark status backgrounds.
- At mobile widths, task tables required horizontal panning to reach completion actions. They now stack into cards while retaining table markup, with the title, deadline, status and actions together.
- Frequently used icon, list and completion actions now have 44px minimum targets; dates and snapshot notes have larger text.
- Recurring-task links now preserve the recurrence tab and month. Pending-approval navigation can show all frequencies.
- Summary filters, task searches and sort order now share URL state across both task sources. Deputy searches retain the deputy route. The tomorrow count opens a tomorrow filter.
- Manager completion approval is explicitly labelled אישור ביצוע. Dashboard rows describe status in words as well as color.
- Deputy work-to-perform counts exclude reports already awaiting approval. Per-person group task reports are evaluated for the current deputy, independently of colleagues.
- Failed recurrence requests show available counts, an explicit partial-data message and a retry action rather than permanent loading placeholders.
- Cancelled tasks are excluded from current all-task filters consistently with dashboard counts.

## Access and interface separation

The owner has a prominent email access-management action. The deputy portal has its own name, sign-in route and install manifest. Anonymous application reads, unapproved sign-ins and revoked memberships are denied; existing sessions lose API access after revocation. The owner-only personal area and management navigation remain hidden from deputy accounts.

## Validation

The application build and TypeScript validation passed. Existing backend authorization/workflow tests and four targeted usability-filter regressions cover deadlines, approval state, assignment modes and independent group reports. The separately deployed deputy manifest returned its expected name and start URL. An authenticated browser walkthrough remains outstanding; no credentials or user records were accessed for QA.
