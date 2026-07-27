import { describe, expect, it } from "vitest";
import { classifyBusinessField, profileExclusionReasons, summarizeColumnProfile } from "../lib/business-context/column-profile";

const measure = { businessName: "Real Hours", physicalColumnName: "REAL_HRS", businessType: "DURATION", fieldRole: "MEASURE" };

describe("KPI column profiling", () => {
  it("calculates variation and null statistics", () => {
    const profile = summarizeColumnProfile([0, 2, 4, null], true);
    expect(profile.nullRatio).toBe(0.25);
    expect(profile.distinctCount).toBe(3);
    expect(profile.mean).toBe(2);
    expect(profile.standardDeviation).toBeGreaterThan(0);
  });

  it("excludes constant and all-zero measures", () => {
    const profile = summarizeColumnProfile([0, 0, 0], true);
    expect(profileExclusionReasons(measure, profile)).toEqual(expect.arrayContaining([
      "only one distinct sampled value", "all sampled numeric values are zero", "standard deviation is zero",
    ]));
  });

  it("keeps status fields as dimensions and recognizes technical metadata", () => {
    expect(classifyBusinessField({ businessName: "State", physicalColumnName: "STATE", businessType: "STATUS", fieldRole: "STATUS_DIMENSION" })).toBe("status_dimension");
    expect(classifyBusinessField({ businessName: "Row Version", physicalColumnName: "ROWVERSION", businessType: "TEXT", fieldRole: "DIMENSION" })).toBe("technical_metadata");
  });
});
