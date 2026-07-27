import { describe, expect, it } from "vitest";
import { orderDashboardKpiCandidates } from "../lib/dashboards/generator-planning";

describe("Dashboard AI generator", () => {
  it("prioritizes unique AI selections and retains approved fallback KPIs", () => {
    const kpis = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(orderDashboardKpiCandidates(kpis, ["b", "b", "unknown"])).toEqual([
      { id: "b" }, { id: "a" }, { id: "c" },
    ]);
  });
});
