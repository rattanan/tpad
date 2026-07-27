import { describe, expect, it } from "vitest";
import { findMeasureColumns, isLikelyMasterOnlyObject, normalizeObjectSuggestions } from "../lib/business-context/object-suggestion";

const candidates = [{ id: "11111111-1111-4111-8111-111111111111", tableName: "WORK_ORDER_TAB", businessName: "Work Orders", description: null, objectType: "TABLE" as const, estimatedRowCount: 12 }];

describe("Business Object AI normalization", () => {
  it("accepts common AI aliases and maps physical TABLE to UNKNOWN", () => {
    const result = normalizeObjectSuggestions({ business_objects: [{ table_id: candidates[0].id, business_name: "Work Orders", description: "Governed work order records", record_grain: null, object_type: "TABLE", reason: "Relevant" }] }, candidates);
    expect(result.objects[0]).toEqual({ tableId: candidates[0].id, businessName: "Work Orders", description: "Governed work order records", recordGrain: undefined, objectType: "UNKNOWN" });
  });

  it("resolves a suggestion by synchronized table name and supplies safe defaults", () => {
    const result = normalizeObjectSuggestions([{ tableName: "WORK_ORDER_TAB", name: "Work Orders", type: "transaction" }], candidates);
    expect(result.objects[0].tableId).toBe(candidates[0].id);
    expect(result.objects[0].objectType).toBe("TRANSACTION");
    expect(result.objects[0].description).toContain("Work Orders");
  });

  it("rejects invented tables", () => {
    expect(() => normalizeObjectSuggestions({ objects: [{ tableId: "22222222-2222-4222-8222-222222222222", businessName: "Invented" }] }, candidates)).toThrow();
  });

  it("deduplicates repeated AI suggestions for the same physical table", () => {
    const result = normalizeObjectSuggestions({ objects: [
      { tableId: candidates[0].id, businessName: "Work Orders", description: "Governed work order records" },
      { tableId: candidates[0].id, businessName: "Duplicate Work Orders", description: "Duplicate suggestion for the same records" },
    ] }, candidates);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].businessName).toBe("Work Orders");
  });

  it("keeps meaningful numeric measures and rejects numeric identifiers", () => {
    const measures = findMeasureColumns([
      { columnName: "REAL_HRS", dataType: "NUMBER", isPrimaryKey: false, isForeignKey: false, sensitivityType: "NONE" },
      { columnName: "SUPPLIER_ID", dataType: "NUMBER", isPrimaryKey: false, isForeignKey: true, sensitivityType: "NONE" },
      { columnName: "SORT_ORDER", dataType: "NUMBER", isPrimaryKey: false, isForeignKey: false, sensitivityType: "NONE" },
      { columnName: "DESCRIPTION", dataType: "VARCHAR2", isPrimaryKey: false, isForeignKey: false, sensitivityType: "NONE" },
    ]);
    expect(measures.map((column) => column.columnName)).toEqual(["REAL_HRS"]);
  });

  it("identifies strong master and lookup object names", () => {
    expect(isLikelyMasterOnlyObject("SUPPLIER_TYPE_TAB")).toBe(true);
    expect(isLikelyMasterOnlyObject("STATUS_LOOKUP_VIEW")).toBe(true);
    expect(isLikelyMasterOnlyObject("WORK_ORDER_LINE_TAB")).toBe(false);
  });
});
