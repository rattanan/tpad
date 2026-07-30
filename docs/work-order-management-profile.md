# Work Order Management — Oracle profile and dashboard plan

Profiled against the configured read-only data source `Oracle IFS UAT` and the published `Maintenance Context` (version 4). The supplied dashboard image was used only as visual inspiration; no values, labels, records, or business logic were copied from it.

## Source inspected

| Oracle object | Rows | Grain |
| --- | ---: | --- |
| `IFSAPP.ACTIVE_WORK_ORDER` | 3,624 | One distinct active work order per `WO_NO` in the profiled result |

The view has 128 columns. Profiling used bounded metadata reads, one aggregate scan over candidate columns, limited category queries, and sample filter queries.

## Useful fields

| Field | Non-null | Distinct | Observed range or values | Dashboard use |
| --- | ---: | ---: | --- | --- |
| `WO_NO` | 3,624 | 3,624 | 22–4,644 | Distinct work-order count |
| `STATE` | 3,624 | 9 | WorkRequest, WorkDone, Released, Observed, Started, FaultReport, Prepared, UnderPreparation, Reported | KPI filters, chart, filter |
| `WORK_TYPE_ID` | 3,582 | 12 populated | MPD, INS, WPK, ASB, ALS, FLG, AD, MOD, TRAN, SB, SL, TO | Chart and filter |
| `MCH_CODE` | 3,615 | 58 | Maintenance-object codes | Top-N chart |
| `MCH_CODE_DESCRIPTION` | 3,615 | 38 | FOKKER F-50, CASA CN235-200M, Bell 412, Bell 212, and others | Equipment chart and searchable filter |
| `ORG_CODE` | 3,624 | 6 | TZ-T, 00-01, MA-E2, MA-E1, TZ-P, TPAD | Accountability chart and filter |
| `LAST_ACTIVITY_DATE` | 3,624 | 1,461 | 22 Jan 2020–28 Jul 2026 (Asia/Bangkok session date) | Annual activity trend |
| `PLAN_S_DATE` | 2,994 | 413 | 3 Nov 2017–26 Nov 2025 | Profile only; no forced widget |
| `PLAN_F_DATE` | 2,879 | 371 | 3 Nov 2017–26 Nov 2025 | Potential schedule date, but no safe dynamic overdue formula in the current engine |
| `REAL_S_DATE` | 314 | 286 | 22 Jan 2020–8 Jan 2026 | Too sparse for a primary trend |
| `REAL_F_DATE` | 254 | 254 | 17 Mar 2020–21 Oct 2025 | Too sparse and not closed-history data |
| `FAULT_REP_FLAG` | 3,624 | 2 | 0/1; only 63 flagged | Profiled, but the actual `FaultReport` state is clearer for the KPI |

`OBJSTATE` contains the uppercase database equivalents of the same nine `STATE` categories. `STATE` was selected because its source values are more readable and no translation is required.

## Actual state values

| `STATE` | `OBJSTATE` | Work orders |
| --- | --- | ---: |
| WorkRequest | WORKREQUEST | 2,955 |
| WorkDone | WORKDONE | 248 |
| Released | RELEASED | 228 |
| Observed | OBSERVED | 73 |
| Started | STARTED | 59 |
| FaultReport | FAULTREPORT | 40 |
| Prepared | PREPARED | 8 |
| UnderPreparation | UNDERPREPARATION | 7 |
| Reported | REPORTED | 6 |

## Excluded or limited fields

| Field or subject | Finding | Decision |
| --- | --- | --- |
| Priority | `PRIORITY_ID` is null in 3,566 of 3,624 rows (98.4%) | No KPI, chart, or filter |
| Responsible people | `WORK_MASTER_SIGN` and `REPORT_IN_BY` are entirely null; `WORK_LEADER_SIGN` has 4 values; `PREPARED_BY` has 3 | No person/team chart |
| Vendor | `VENDOR_NO` has only 2 populated rows | No vendor KPI or chart |
| Planned/actual hours | `PLAN_HRS`, `REAL_HRS`, and `PLAN_MEN` are entirely null; `PLANNED_MAN_HRS` has only 2 identical values of 4 | Existing planned-hours KPI was not used |
| Cancellation | `CANCEL_CAUSE` is entirely null and the active view has no cancellation history | No cancellation analysis |
| Failure classification | `ERR_CLASS` and `ERR_TYPE` are entirely null; `CALL_CODE` has only 7 populated rows and one value | No failure-category chart |
| Connection type | 3,623 EQUIPMENT and 1 LINEAR ASSET | Too close to constant for a useful chart/filter |
| Contract/site | `CONTRACT` has one value | No filter or chart |
| Organization | TZ-T contains 3,530 of 3,624 rows (97.4%) | Retained with an explicit skew note because it still supports ownership filtering |
| Registration date | 23 dates are in implausible future years (2563/2568); 3,601 dates are plausible and not future-dated | No creation trend; avoids a distorted time axis |
| Completion history | The mapped source is an active-work-order view; only 254 `REAL_F_DATE` values exist | No completion count, rate, or completion trend |
| Overdue logic | Planned finish is populated, but the supported formula/filter engine cannot safely compare it to dynamic `SYSDATE` | No overdue KPI |
| Aging buckets | The dashboard query engine groups only by published physical fields and has no calculated bucket dimension | No aging chart |
| Date-range filter | The runtime filter path converts values to `Date`, while the current query-plan scalar validator rejects `Date` objects | Omitted after executable validation failed; runtime source was not changed |

## Business questions implemented

1. How large is the current active-work-order backlog?
2. How is the backlog distributed by actual Oracle state?
3. How many work orders are in the WorkRequest, Released, Started, WorkDone, and FaultReport states?
4. Which work-order types dominate the active workload?
5. Which aircraft, equipment descriptions, and maintenance objects carry the most active work?
6. Which maintenance organizations own the workload?
7. When were active work orders most recently updated?

## KPIs

All KPIs use `COUNT(DISTINCT IFSAPP.ACTIVE_WORK_ORDER.WO_NO)` and return Oracle data at execution time.

| KPI | Formula/filter | Profile value | Data-quality note and selection reason |
| --- | --- | ---: | --- |
| Active Work Orders | No state filter | 3,624 | Existing certified KPI; the active view and unique `WO_NO` support the measure |
| Work Requests | `STATE = 'WorkRequest'` | 2,955 | Fully populated exact state; largest visible backlog segment |
| Released | `STATE = 'Released'` | 228 | Exact populated operational state |
| Started | `STATE = 'Started'` | 59 | Exact state for work in execution; no broader mapping inferred |
| Work Done (Active View) | `STATE = 'WorkDone'` | 248 | Kept explicitly separate from completed/closed-history semantics |
| Fault Reports | `STATE = 'FaultReport'` | 40 | Exact source state highlighting a distinct queue |

The five new filtered KPIs are `APPROVED` and `TECHNICALLY_VALIDATED`; their generated Oracle SQL and source fields are stored with the governed metadata.

## Dashboard blocks

1. Active Work Orders — KPI card
2. Work Requests — KPI card
3. Released — KPI card
4. Started — KPI card
5. Work Done (Active View) — KPI card
6. Fault Reports — KPI card
7. Work Orders by State — horizontal distribution chart
8. Work Orders by Type — comparison bar chart
9. Work Orders by Equipment Type — Top-N horizontal bar chart
10. Active Work Order Activity Trend — annual line chart using `LAST_ACTIVITY_DATE`; annual grain keeps the full 2020–2026 series visible in the supported renderer
11. Work Orders by Maintenance Object — Top-N horizontal bar chart
12. Work Orders by Organization — comparison bar chart with a skew warning

The published renderer currently returns every grouped category and uses the block's `categoryLimit`/`topN` visualization configuration for display. The source queries retain the application's required parameterized row limit.

## Filters

| Filter | Control | Cardinality | Applies to |
| --- | --- | ---: | --- |
| Work Order State | Multi-select checkbox group | 9 | All 12 blocks |
| Work Order Type | Searchable multi-select | 12 populated values | All 12 blocks |
| Aircraft / Equipment | Searchable multi-select | 38 populated values | All 12 blocks |
| Maintenance Organization | Multi-select checkbox group | 6 | All 12 blocks |

Allowed values are refreshed from Oracle when the seed runs. Each filter was executed against a published KPI widget after publication.

## Validation result

- Dashboard editor service: published version returned 12 blocks and 4 filters.
- Published portal service: slug returned 12 blocks and 4 filters.
- All 12 published widget queries executed successfully with source `ORACLE_READ_ONLY`.
- All four saved filters executed successfully against a live published widget.
- SQL was generated by `lib/dashboards/query.ts`, checked by `lib/dashboards/rules.ts`, and executed with parameterized row limits.
- The seed is idempotent for the dashboard, version, blocks, filters, KPI codes, and publication.
- No Oracle inserts, updates, deletes, DDL, or procedural calls are present in either profiling or dashboard scripts.
- No runtime application source file was modified.

## Commands and identifiers

```bash
npx --no-install tsx --env-file=.env scripts/profile-work-order-oracle.ts
npx --no-install tsx --env-file=.env scripts/seed-work-order-dashboard.ts
npx --no-install tsx --env-file=.env scripts/verify-work-order-dashboard.ts
```

- Dashboard slug: `work-order-management`
- Dashboard ID: `70000000-0000-4000-8000-000000000001`
- Published version ID: `71000000-0000-4000-8000-000000000001`
