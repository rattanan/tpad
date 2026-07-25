# KPI Formula AST

The formula format is a TypeScript/Zod discriminated union. Nodes support fields, literals, arithmetic, aggregates, ratio, percentage, conditions, date difference, rolling/MTD/YTD/previous period, growth, variance, and allowlisted custom structured functions.

```json
{
  "type": "aggregate",
  "function": "SUM",
  "expression": { "type": "field", "businessFieldId": "approved-field-uuid" },
  "filters": [{ "businessFieldId": "status-field-uuid", "operator": "IN", "values": ["Open", "Released"] }]
}
```

Raw SQL is never accepted as a formula. The Oracle compiler resolves identifiers exclusively from approved mappings, quotes validated identifiers, uses bind parameters for values, joins only through approved model relationships, inserts `NULLIF` for division, and appends a row limit. Only `ABS`, `ROUND`, and `COALESCE` are initially accepted custom functions.
