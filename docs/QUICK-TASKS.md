# Fast task workflows

Only a title is required in the quick composer. A task defaults to creator-private and has no deadline. An optional date, assignees selected by position/name, description, importance, urgency, recurrence, end of recurrence and individual/shared completion remain available. Recurring tasks have scheduled occurrences; a missing first date defaults to today. Existing dated tasks retain their deadlines. Undated tasks are excluded from deadline urgency and deadline reminders.

Personal and assigned lists expose completion buttons directly. Assignee reports still require creator approval; the manager can approve or return work from the home focus inbox. The home inbox combines ordinary tasks and recurring/assigned occurrences for approvals, today and overdue work. A fixed add button opens quick capture from every view, including mobile.

Private attention points can be edited, completed, archived, restored or converted into tasks while keeping their ID and text. Conversion can assign a recipient and optional date. Changing assignees clears earlier completion reports for those occurrences rather than marking newly assigned work completed. Assignment scope remains enforced at the server.

Lists support selection of multiple tasks for completion/reporting, approval, or reassignment. Each occurrence's multiple recipients are changed atomically. Multi-task actions report partial success if a later item conflicts; already saved actions can be undone. One-minute undo records are private to the original actor and organization and use optimistic versions; expired, reused, or superseded undo requests are rejected. Undo cannot overwrite a newer edit or completion.

Global search covers visible ordinary tasks, personal/assigned tasks, private points, library documents and meeting/inspection summaries. Full document text and attachment filenames are searchable. Result links open the matching task or document. Search does not return file bytes or another member's private tasks/points.

Migration 0005 is additive and is included in the existing guarded synthetic preview migration. No live email provider or scheduler is enabled by these changes. Production database migration is still explicit.

Validation: 69 backend tests passed, including title-only creation, adding/removing deadlines, scoped recipient selection, conversion and undo, single-use/expiry/conflict checks, ordinary task undo, atomic multi-recipient review, and full-text search/privacy. TypeScript and production Next build passed. Browser acceptance tests were updated; browser execution was unavailable.
