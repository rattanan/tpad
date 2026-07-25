# Phase 3 — Business Context Layer and KPI Catalogue

Phase 3 adds the governed layer between synchronized Oracle/IFS metadata and future dashboard generation. A model belongs to one data source and one Oracle schema. Physical tables/views become Business Objects, columns become Business Fields, approved relationships define safe join paths, and KPIs reference Business Field IDs through a typed AST.

## User flow

1. Create a model from an authorized synchronized data source.
2. Map physical objects and columns. Column mapping is automatic but remains a draft.
3. Document grain, business meaning, field roles, valid aggregation, sensitivity, and AI visibility.
4. Build and validate relationships using the visual workspace and bounded read-only Oracle probes.
5. Run sanitized IFS metadata analysis and accept, modify, or reject recommendations.
6. Build KPI definitions without raw SQL, validate, and execute a bounded read-only test.
7. Submit, approve, publish, search, and consume only governed definitions.

Published snapshots are immutable. A change or rollback creates another version. Phase 1 authentication/audit and Phase 2 physical metadata/credential services remain authoritative.

## Roles

- Admin governs, publishes, rolls back, approves, and certifies.
- Data Source Creator manages authorized model drafts and tests; publishing requires an explicit source grant.
- Dashboard Creator sees published context and approved/certified KPIs.
- Viewer sees dashboard-facing approved KPI descriptions only.

The application stores all Phase 3 data in MySQL. It never changes Oracle schema or data.
