# Business Context Versioning

Publishing captures immutable snapshots for objects, fields, relationships, KPIs, and glossary records. Each snapshot has a version number, optional parent, change summary, creator/reviewer/approver/publisher, and publication time.

The supported lifecycle is draft → validate → review → approve → publish. To change a published model, create a new draft version. Version comparison reports added, removed, and modified IDs. A rollback is implemented by publishing a new version whose snapshots are based on the selected historical version. Historical rows are never mutated.
