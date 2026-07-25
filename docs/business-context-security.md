# Business Context Security

- Credentials and connection strings stay in the encrypted Phase 2 service and never enter AI payloads or client responses.
- Metadata comments are treated as hostile text. Input is normalized, delimited, sanitized, bounded, and hashed; sensitive sample values are excluded.
- AI output is schema-validated, tracked by provider/prompt version/token counts, retried with timeout, and saved only as reviewable recommendations.
- Every route authenticates. Mutations additionally check same-origin, validate input, enforce functional permission plus data-source scope, and audit sanitized changes.
- Published metadata is immutable; referenced records use soft deletion and restrictive foreign keys.
- Oracle KPI/relationship execution accepts no user SQL. Identifiers come from mapped metadata, values are bound, DDL/DML/procedural tokens are rejected, call timeout is inherited, rows are capped at 100, results at 1 MB, and concurrent KPI tests at three.
- Viewer projections hide physical object/column names, source IDs, AST, generated SQL, reviews, recommendations, and snapshots.
