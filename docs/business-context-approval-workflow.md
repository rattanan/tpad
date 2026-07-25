# Business Context Approval Workflow

The governance stages are:

`DRAFT → AI_ANALYSIS → DATA_STEWARD_REVIEW → TECHNICAL_VALIDATION → BUSINESS_OWNER_REVIEW → APPROVED → PUBLISHED`

Review requests store stage, requester, assignee, timestamps, and status. Actions store reviewer, approve/reject/request-changes/comment decision, comment, version, changed fields, and timestamp. AI output is always a pending recommendation and cannot publish content.

KPI drafts must pass technical validation before review. Admin approval moves them to `APPROVED`; certification is a separate action. Dashboard Creator and Viewer projections cannot discover unapproved KPI definitions.
