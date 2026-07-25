# Business Context Model Design

A Business Context Model is scoped by `data_source_id` and `schema_name`; the application has no separate tenant entity. Cross-data-source relationships are rejected in service code and by source-scoped foreign keys.

Statuses are `DRAFT`, `AI_ANALYZING`, `READY_FOR_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `PUBLISHED`, and `ARCHIVED`. `PUBLISHED` and `ARCHIVED` rows are immutable through the shared editable-state guard.

Published versions store separate object, field, relationship, KPI, and glossary JSON snapshots. Snapshot rows are append-only. Rollback copies an old snapshot into a newly numbered published version; it never updates the old row.

Default domains include Procurement, Inventory, Maintenance, Fleet, Finance, and Other, with English/Thai names. Models may add governed domains without hard-coding one customer's schema.
