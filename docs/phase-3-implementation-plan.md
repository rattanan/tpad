# Phase 3 Implementation Plan — Business Context Layer and KPI Catalogue

## Current architecture

- **Framework:** Next.js 16.2 App Router with React 19 and TypeScript. Pages are server components by default; interactive forms and workspaces are client components. Dynamic route parameters are asynchronous, following the installed Next.js 16 conventions.
- **UI:** Tailwind CSS 4 plus project-owned CSS and React components. The authenticated `AppShell` provides the InsightFS sidebar, top bar, role-aware navigation, and responsive mobile behavior. The repository does not currently include shadcn/Radix, a graph library, or a notification package, so Phase 3 will reuse the existing visual language and implement focused accessible components without adding a large dependency.
- **Application database:** MySQL through Drizzle ORM. Schema declarations live in `lib/db/schema.ts`; ordered SQL migrations live in `drizzle/` and are applied by `scripts/migrate.ts` with a `schema_migrations` ledger.
- **Authentication:** Server-side, cookie-backed sessions in `lib/auth/session.ts`. Protected layouts redirect unauthenticated users and users who must change their password.
- **Authorization:** Static role permissions in `lib/auth/permissions.ts`, combined with data-source-scoped grants in `data_source_access` and `requireDataSourceAccess`. Phase 3 will extend these mechanisms rather than introduce a second RBAC system.
- **Audit:** Append-only audit records through `writeAudit`, including request ID, actor, network context, masked before/after values, result, target, and timestamp.
- **Oracle integration:** Encrypted credentials, pooled `oracledb` connections, server-side timeouts, safe public data-source serialization, metadata discovery, and masked sample previews. Oracle is treated as read-only. Phase 3 KPI and relationship probes will only execute generated, allowlisted `SELECT` statements with bind parameters and strict limits.
- **Physical metadata:** Existing `data_source_schemas`, `data_source_tables`, `data_source_columns`, `data_source_relationships`, and indexes are the authoritative source for Business Context mappings.
- **HTTP conventions:** App Router route handlers authenticate, verify same-origin for mutations, validate with Zod, call service functions, audit mutations, and normalize errors through `apiError`/`HttpError` without leaking internal exceptions.
- **Background processing:** No general queue exists. Metadata synchronization runs synchronously while persisting run state. AI analysis will use persisted job records and a provider boundary; execution remains in-process for Phase 3 and is designed so a durable worker can replace it later.
- **AI:** No provider implementation or SDK currently exists. Phase 3 will add a vendor-neutral interface, a production-safe deterministic IFS metadata analysis provider, schema validation, redaction, prompt-version tracking, retry/timeout behavior, and token/usage fields. No credentials, connection strings, or raw sensitive values enter analysis payloads.
- **Testing:** Vitest 4 for unit and integration tests. No browser E2E runner is installed; the complete user journey will be covered by a Vitest service/API workflow test and documented for later browser automation.
- **Verification commands:** `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.

## Reusable components and services

- `components/layout/app-shell.tsx` and `components/layout/protected-shell.tsx`
- Existing buttons, cards, badges, tables, inputs, empty/loading/error states in `app/globals.css`
- `components/ui/loading-state.tsx`
- Session and permission helpers in `lib/auth/`
- `writeAudit` and `maskSensitive`
- Data-source access, safe serialization, Oracle pool, and physical metadata services in `lib/data-sources/`
- `apiError`, `HttpError`, request metadata, and same-origin protection
- Drizzle connection/schema and the ordered migration runner

## Database changes

The Phase 3 migration will add the required MySQL tables:

1. `business_context_models`
2. `business_context_model_versions`
3. `business_domains`
4. `business_objects`
5. `business_fields`
6. `business_relationships`
7. `business_relationship_validation_results`
8. `business_glossary_terms`
9. `business_synonyms`
10. `kpi_definitions`
11. `kpi_formula_nodes`
12. `kpi_source_fields`
13. `kpi_filters`
14. `kpi_thresholds`
15. `kpi_validation_results`
16. `kpi_test_cases`
17. `kpi_test_results`
18. `ai_business_context_analysis_jobs`
19. `ai_business_context_recommendations`
20. `business_context_review_requests`
21. `business_context_review_actions`

There is no workspace, organization, or tenant entity in the current system. Scope will therefore be enforced through `data_source_id` and `model_id`; no conflicting tenancy column will be invented. Applicable mutable/referenced records will carry creator/updater timestamps, a version counter, status, and `deleted_at`. Foreign keys will use `RESTRICT` or soft deletion for governed records. Published version rows contain separate immutable JSON snapshots for objects, fields, relationships, KPIs, and glossary entries.

The data-source access enum will be extended with Business Context manage, use, and explicit publish grants. The current unapplied Phase 3 draft migration will be replaced before it is applied, so no rename/backfill migration is necessary.

## Permissions

The application permission union will be extended with the requested Business Context, object, field, relationship, KPI, and glossary permissions. Role defaults:

- **Admin:** all Phase 3 permissions.
- **Data Source Creator:** view/create/update/analyze/review, object/field/relationship management and validation, KPI draft/validation/test/review, and glossary management for authorized sources. Publish requires an explicit `PUBLISH_BUSINESS_CONTEXT` data-source grant.
- **Dashboard Creator:** published Business Context and approved/certified KPI viewing only, without physical metadata or SQL.
- **Viewer:** dashboard-facing approved KPI descriptions only; no physical names, SQL, credentials, or internal metadata.

All service and route operations will perform role permission checks plus data-source scope checks. UI visibility is only a convenience and is never the enforcement boundary.

## New APIs

- Model CRUD and workflow: `/api/business-context-models`, `/api/business-context-models/[id]`, plus analyze, validate, submit-review, approve, publish, create-version, and rollback actions.
- Object/field CRUD: nested model/object collection routes and individual business object/field routes.
- Relationship CRUD and validation: model relationship collection, individual relationship update, and validation action.
- KPI CRUD and workflow: `/api/kpis`, `/api/kpis/[id]`, validate, test, submit-review, approve, and certify actions.
- Glossary CRUD: `/api/business-glossary` and individual term update.
- Unified search: `/api/business-context-search` with keyword/synonym, language, domain, source, approval, and certification filters.

Routes will use the existing JSON/error convention, validate all inputs, prevent cross-source references, audit state changes, redact sensitive values, and expose role-specific projections.

## New pages and UI modules

- `/business-context-models` — searchable, paginated model catalogue and model creation.
- `/business-context-models/[modelId]` — Overview, Business Objects, Fields, Relationships, KPI Catalogue, AI Recommendations, Validation, Versions, and Audit Log tabs.
- `/kpi-catalogue` — role-filtered KPI catalogue.
- `/kpi-catalogue/[kpiId]` — definition, typed formula, mappings, validation, test lab, lineage, review, and version information.
- Relationship workspace — native HTML/SVG nodes and edges with drag, pan, zoom, selection, warning states, keyboard-operable controls, and no large graph dependency.
- Three-panel review workspace — object explorer, main editor, and contextual AI/validation panel with responsive fallback.
- Shared Phase 3 status badges, loading/empty/error states, drawers/dialogs, formula viewer/builder, search, lineage, and version comparison components.

The InsightFS sidebar will gain **Business Context** and **KPI Catalogue** entries with role-aware visibility. The stale dashboard phase label will be corrected so Phase 3 is represented by the new modules.

## Core services

- Central Phase 3 permission and scope resolver.
- Business Context model/object/field/relationship repository and immutable published-state guard.
- Business field type, role, sensitivity, and aggregation validators.
- Relationship graph validation including circular paths, cardinality, fan-out, cross-source/schema, null-rate, and duplicate-measure warnings.
- Vendor-neutral AI provider contract, metadata sanitizer/redactor, IFS pattern provider, retry/timeout wrapper, and recommendation review/apply workflow.
- Typed KPI AST parser, normalized-node persistence, semantic validation, safe Oracle SQL compiler, bind generation, read-only guard, and limited executor.
- Version snapshot, comparison, draft-from-version, rollback-as-new-version, review, approval, and publication state machine.
- Glossary/synonym search, lineage projection, and role-specific response redaction.

## Implementation sequence

1. Finalize this analysis and reconcile the schema/migration with the primary specification.
2. Extend RBAC and data-source scope enforcement.
3. Implement shared validation, immutable-state, workflow, audit, and repository services.
4. Implement model, object, and field APIs and basic UI.
5. Implement relationship builder and validation.
6. Implement AI analysis infrastructure and recommendation review.
7. Implement KPI catalogue, typed formula AST, validation, and safe test lab.
8. Implement glossary, search, lineage, versions, approval, publication, and rollback.
9. Add unit, integration, workflow/E2E-style tests and the required design/security/test documentation.
10. Apply the MySQL migration and run lint, typecheck, all tests, and production build; repair any Phase 1/2 regressions.

## Risks and mitigations

- **Schema size and migration atomicity:** MySQL DDL can implicitly commit. The migration is idempotent, ordered, and will be validated before application; it will not touch Oracle.
- **Large IFS catalogue:** list/search APIs will paginate and select only required columns. Analysis jobs will accept bounded table sets and process metadata in deterministic batches.
- **Oracle safety:** only compiler-generated `SELECT` statements are executable; identifiers come from approved metadata, values use binds, statements are scanned for forbidden tokens, row/result/time limits are mandatory, and concurrency is bounded in-process.
- **Join correctness:** ambiguous grains and many-to-many/fan-out paths block or warn during validation rather than silently producing a KPI.
- **Published immutability:** all mutations call a central editable-state guard. Changes and rollbacks create new draft/version records instead of mutating historical snapshots.
- **AI trust:** metadata is treated as hostile input, delimited and sanitized; sensitive values and credentials are excluded; output is schema-validated; recommendations remain pending until reviewed.
- **No durable worker:** persisted jobs provide recoverability and observability, but in-process execution can be interrupted by deployment. The provider/job boundary is designed for a Phase 4+ queue adapter.
- **No installed browser E2E framework:** the repository test stack will cover the complete workflow at service/API level. A browser-runner adoption remains a documented limitation rather than adding a large dependency without an established project convention.

## Compatibility impact

- Phase 1 authentication, session, user management, and audit tables remain unchanged.
- Phase 2 Oracle tables and sync workflows remain the physical metadata authority.
- The only existing-table DDL change is extension of the `data_source_access.permission` enum.
- Existing data-source permissions retain their behavior. Data Source Creator ownership continues to grant normal management but never grants Phase 3 publication implicitly.
- Viewer and Dashboard Creator projections become stricter for physical metadata and generated SQL.
- No Oracle DDL/DML is introduced.

## Files expected to be created

- `drizzle/0006_phase3_business_context.sql`
- `lib/business-context/` services for permissions, validation, formulas, SQL compilation/execution, relationships, AI, reviews, versions, search, and lineage
- Phase 3 API route handlers under `app/api/business-context-models/`, `app/api/business-objects/`, `app/api/business-fields/`, `app/api/business-relationships/`, `app/api/kpis/`, `app/api/business-glossary/`, and `app/api/business-context-search/`
- Pages and layouts under `app/business-context-models/` and `app/kpi-catalogue/`
- Phase 3 UI components under `components/business-context/` and `components/kpis/`
- Required Phase 3 documentation files in `docs/`
- Unit/integration/workflow tests in `tests/`

## Files expected to be modified

- `lib/db/schema.ts`
- `scripts/migrate.ts`
- `lib/auth/permissions.ts`
- `lib/data-sources/service.ts`
- `lib/data-sources/validation.ts`
- `components/data-sources/access-manager.tsx`
- `components/layout/app-shell.tsx`
- `app/globals.css`
- Existing shared error, audit, or Oracle helpers only where required to expose safe reusable behavior

