import { describe, expect, it } from "vitest";
import { buildNonNullPresenceQuery } from "../lib/data-sources/presence-query";

describe("read-only field data availability query", () => {
  it("checks only non-null presence without selecting values", () => {
    const result = buildNonNullPresenceQuery("IFSAPP", "WORK_ORDER_TAB", ["REAL_HRS", "WO_NO"]);
    expect(result.aliases).toEqual(["P0", "P1"]);
    expect(result.sql).toContain('"REAL_HRS" IS NOT NULL');
    expect(result.sql).toContain('"WO_NO" IS NOT NULL');
    expect(result.sql).toContain("ROWNUM <= 1");
    expect(result.sql).not.toMatch(/INSERT|UPDATE|DELETE|MERGE|DROP|ALTER/i);
  });

  it("rejects unsafe Oracle identifiers", () => {
    expect(() => buildNonNullPresenceQuery("IFSAPP", "WORK_ORDER_TAB; DROP TABLE X", ["REAL_HRS"])).toThrow("Invalid Oracle identifier");
  });
});
