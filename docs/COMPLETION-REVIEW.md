# Completion review and private points

Assigned rhythm occurrences now keep assignee reports separate from approved completions. Only the task creator may approve or reject a pending report. Reports do not clear urgency or mark the task completed. Rejection returns it to not done. Shared tasks close for everyone only after approval; individual assignments require approval per recipient. Private tasks toggle directly. Existing approved completion data remains intact.

The ordinary task list also provides done/not-done actions. Assignee completion reports enter pending review; creator approval completes them. Personal tasks can be completed directly and reopened.

Personal includes a private Points for attention folder with persistent additions, completion and archive. Points have no user-facing deadline and never become urgent or generate mail. The three supplied examples can be added individually. The recurring tab is now שעל״ח.

Migration 0004 adds only category and report columns. The exact guarded synthetic feature preview applies it automatically; production remains an explicit migration.

Validation: 62 backend tests pass, including report authorization, rejection and resubmission, per-recipient/shared approval, private points visibility and persistence. TypeScript and Next production build pass. Browser acceptance testing was unavailable in this environment.

See QUICK-TASKS.md for the simplified optional-date composer, home approvals, global search, bulk actions and undo.
