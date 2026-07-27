import { describe, expect, it } from "vitest";
import { inferAnalyticalRole, interpretBusinessIntent, scoreIntentField, semanticRelevance } from "../lib/business-context/business-intent";
import { summarizeColumnProfile } from "../lib/business-context/column-profile";

describe("business-context intent discovery", () => {
  it("interprets an inventory model from its name and Thai description", () => {
    const intent = interpretBusinessIntent("Inventory Onhand", "ต้องการวิเคราะห์สินค้าคงเหลือในแต่ละคลังและ location");

    expect(intent.domain).toBe("Inventory Management");
    expect(intent.primaryObjective).toContain("inventory availability");
    expect(intent.businessConcepts).toEqual(expect.arrayContaining(["Part Master", "Inventory Balance", "Warehouse", "Inventory Location"]));
    expect(intent.businessQuestions.some((question) => question.includes("on-hand inventory"))).toBe(true);
  });

  it("ranks semantically relevant metadata above technical audit metadata", () => {
    const intent = interpretBusinessIntent("Inventory Onhand", "Analyze stock by warehouse and part");
    const inventory = semanticRelevance(intent, "INVENTORY_PART_IN_STOCK", "Inventory Balance", "On hand and reserved quantity by warehouse");
    const audit = semanticRelevance(intent, "APP_AUDIT_LOG", "Application Audit", "User session and configuration changes");

    expect(inventory).toBeGreaterThan(audit);
  });

  it("selects populated varying measures and excludes unusable or technical fields", () => {
    const intent = interpretBusinessIntent("Inventory Onhand", "Analyze current stock quantity");
    const quantity = { columnName: "QTY_ONHAND", businessName: "Quantity On Hand", description: "Current inventory quantity", dataType: "NUMBER", isPrimaryKey: false, isForeignKey: false };
    const technical = { columnName: "ROWVERSION", businessName: "Row Version", description: null, dataType: "VARCHAR2", isPrimaryKey: false, isForeignKey: false };

    expect(inferAnalyticalRole(quantity)).toBe("measure");
    expect(scoreIntentField(intent, quantity, summarizeColumnProfile([4, 7, 9, 12], true)).selected).toBe(true);
    expect(scoreIntentField(intent, quantity, summarizeColumnProfile([0, 0, 0, 0], true)).selected).toBe(false);
    expect(scoreIntentField(intent, quantity, summarizeColumnProfile([null, null, null, 1], true)).selected).toBe(false);
    expect(scoreIntentField(intent, technical, summarizeColumnProfile(["A", "B", "C"], false)).selected).toBe(false);
  });

  it("classifies meaningful numeric flags as status dimensions instead of measures", () => {
    const flag = { columnName: "IS_RESERVED", businessName: "Is Reserved", description: "Inventory reservation flag", dataType: "NUMBER", isPrimaryKey: false, isForeignKey: false };
    expect(inferAnalyticalRole(flag)).toBe("status");
  });
});
