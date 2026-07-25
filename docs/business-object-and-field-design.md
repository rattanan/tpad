# Business Object and Field Design

Business Objects map a physical table/view to a business concept and carry record grain, domain, owner/steward, sensitivity, AI eligibility, approval, and visual layout coordinates.

Examples:

| Physical object pattern | Business Object | Example grain |
|---|---|---|
| `PURCHASE_ORDER_TAB` | Purchase Order | One purchase order |
| `PURCHASE_ORDER_LINE_TAB` | Purchase Order Line | One order line/release |
| `SUPPLIER_INFO*` | Supplier | One supplier |
| `INVENTORY_PART_IN_STOCK*` | Inventory Stock | One part, site, and location balance |
| `WORK_ORDER*` | Maintenance Work Order | One maintenance work order |
| `EQUIPMENT_OBJECT*` | Aircraft / Equipment | One equipment object |
| maintenance event views | Maintenance Event | One event occurrence |

Business Fields reference physical column IDs. Roles distinguish dimensions, measures, identifiers, dates, statuses, foreign keys, technical/sensitive fields, and ignored fields. Text, status, identifier, and date fields cannot be summed. Measures require an aggregation. Sensitive fields are excluded from AI by default; ignored fields cannot be dashboard-visible.
