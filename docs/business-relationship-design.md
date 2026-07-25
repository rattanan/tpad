# Business Relationship Design

Relationships connect approved Business Field IDs within one model/data source. Supported joins are INNER, LEFT, and RIGHT. Cardinality is explicit; FULL OUTER is intentionally absent.

The native SVG/HTML workspace supports draggable object cards, zoom, typed edges, status coloring, persisted coordinates, relationship creation, and validation. Static checks cover self/circular paths, many-to-many joins, cardinality versus uniqueness, cross-schema joins, unapproved fields, missing grain, and duplicate-measure risk.

The optional Oracle probe is a generated `SELECT` only. It samples at most 1,000 values per endpoint and calculates match rate, unmatched rows, null rate, and fan-out ratio under the data source timeout. A failed probe produces a warning rather than weakening static validation.
