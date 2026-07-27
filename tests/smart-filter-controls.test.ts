import { describe, expect, it } from "vitest";
import { parseSmartFilterConfiguration, recommendFilterConfiguration } from "../lib/dashboards/filter-controls";

const field = { businessType: "STRING", fieldRole: "DIMENSION", searchable: false, businessName: "State" };

describe("smart dashboard filter recommendations", () => {
  it("uses compact categorical controls for small allowlists", () => {
    expect(recommendFilterConfiguration(field, 5, "MULTI_SELECT").controlType).toBe("CHECKBOX_GROUP");
    expect(recommendFilterConfiguration(field, 5, "SINGLE_SELECT").controlType).toBe("DROPDOWN");
  });

  it("uses searchable controls for medium and high cardinality", () => {
    expect(recommendFilterConfiguration(field, 50, "MULTI_SELECT").controlType).toBe("SEARCHABLE_MULTI_SELECT");
    expect(recommendFilterConfiguration(field, 500, "SINGLE_SELECT").controlType).toBe("ASYNC_SEARCHABLE_DROPDOWN");
    expect(recommendFilterConfiguration(field, 500, "SINGLE_SELECT").pageSize).toBeLessThanOrEqual(50);
  });

  it("selects typed date, number, and boolean controls", () => {
    expect(recommendFilterConfiguration({ ...field, businessType: "DATE" }, 0, "DATE_RANGE").controlType).toBe("RELATIVE_DATE");
    expect(recommendFilterConfiguration({ ...field, businessType: "NUMBER" }, 0, "NUMERIC_RANGE").controlType).toBe("NUMBER_RANGE");
    expect(recommendFilterConfiguration({ ...field, businessType: "BOOLEAN" }, 2, "BOOLEAN").controlType).toBe("TOGGLE");
  });

  it("preserves safe defaults when legacy configuration is incomplete", () => {
    const fallback = recommendFilterConfiguration(field, 5, "SINGLE_SELECT");
    const parsed = parseSmartFilterConfiguration(JSON.stringify({ placeholder: "Choose state" }), fallback);
    expect(parsed.controlType).toBe("DROPDOWN");
    expect(parsed.placeholder).toBe("Choose state");
    expect(parsed.dependsOn).toEqual([]);
  });
});
