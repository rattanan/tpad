# KPI Catalogue Design

KPI definitions contain general, calculation, mapping, presentation, and governance metadata. Formulas are typed ASTs plus normalized nodes; source fields, filters, thresholds, validation results, test cases, and test results are separate governed records.

Example catalogue entries:

- Total Purchase Order Amount — sum approved Purchase Order Line amount.
- Open Purchase Order Count — distinct orders filtered to Open/Released.
- Average Purchase Order Value — total amount divided by distinct order count.
- On-time Delivery Rate — on-time receipts divided by eligible receipts.
- Inventory Stock Value — quantity on hand multiplied by approved unit cost.
- Low Stock Part Count — distinct parts below approved reorder threshold.
- Open Work Order Count and Overdue Work Order Count.
- Fleet Readiness Rate — available aircraft divided by governed fleet population.

Only `APPROVED` or `CERTIFIED` KPIs are selectable by a future production Dashboard Builder. Viewer responses exclude formula AST, generated SQL, source IDs, and physical metadata.
