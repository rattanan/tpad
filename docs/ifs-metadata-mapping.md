# IFS Metadata Mapping

The pattern provider recognizes common IFS conventions without assuming a single customer schema: `_TAB`, `ROWKEY`, `ROWVERSION`, `OBJID`, `OBJVERSION`, `CONTRACT`, `SITE`, `COMPANY`, `PART_NO`, `ORDER_NO`, `LINE_NO`, and `RELEASE_NO`.

`ROWKEY`, `ROWVERSION`, `OBJID`, and `OBJVERSION` are recommended as technical fields, but are never hidden automatically. Key flags and Oracle data types drive initial role/type suggestions; Phase 2 sensitivity classifications force AI exclusion. Names, comments, and samples are untrusted, normalized, control-character stripped, prompt-injection patterns redacted, and bounded before analysis.

Useful starter concepts are Purchase Order, Purchase Order Line, Supplier, Inventory Part, Inventory Stock, Maintenance Work Order, Aircraft, and Maintenance Event. Every suggestion requires a human decision.
