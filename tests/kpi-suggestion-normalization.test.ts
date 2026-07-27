import { describe, expect, it } from "vitest";
import { normalizeKpiSuggestions } from "../lib/business-context/kpi-suggestion";

const fields = [
  { id: "11111111-1111-4111-8111-111111111111", businessName: "Real Work Hours", businessType: "NUMBER", fieldRole: "MEASURE", aggregationRule: "SUM", unit: "Hrs." },
  { id: "22222222-2222-4222-8222-222222222222", businessName: "Planned Work Hours", businessType: "NUMBER", fieldRole: "MEASURE", aggregationRule: "SUM", unit: "Hrs." },
];

describe("KPI AI suggestion normalization", () => {
  it("accepts common AI aliases and nullable optional values", () => {
    const result = normalizeKpiSuggestions({ draft_kpis: [{ business_field_id: fields[0].id, kpi_name: "Average Work Hours", kpi_code: "avg-work-hours", definition: "Average governed work hours per record.", aggregation: "AVG", measure_type: "non-additive", business_question: null, visualization: "Bar chart", extra: "ignored" }] }, fields);
    expect(result.kpis[0]).toMatchObject({ fieldId: fields[0].id, code: "AVG_WORK_HOURS", aggregation: "AVERAGE", measureType: "NON_ADDITIVE", unit: "Hrs.", recommendedVisualization: "Bar chart" });
  });

  it("rejects invented fields and supplies safe defaults", () => {
    expect(normalizeKpiSuggestions({ kpis: [{ fieldId: "33333333-3333-4333-8333-333333333333", name: "Invented" }] }, fields).kpis).toEqual([]);
    const result = normalizeKpiSuggestions([{ fieldId: fields[0].id }], fields);
    expect(result.kpis[0].name).toContain("Real Work Hours");
    expect(result.kpis[0].description.length).toBeGreaterThanOrEqual(10);
  });

  it("normalizes supported ratio evidence and dimensions", () => {
    const result = normalizeKpiSuggestions({ kpis: [{ fieldId: fields[0].id, denominator_field_id: fields[1].id, denominator_aggregation: "sum", confidence_score: 88, evidence: ["Both measures vary"], useful_dimension_field_ids: ["dimension-id"] }] }, fields);
    expect(result.kpis[0]).toMatchObject({ denominatorFieldId: fields[1].id, denominatorAggregation: "SUM", measureType: "RATIO", confidenceScore: 88, evidence: ["Both measures vary"], usefulDimensionFieldIds: ["dimension-id"] });
  });
});
