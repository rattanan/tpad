import {describe,expect,it} from "vitest";
import {formatChartLabel} from "../lib/dashboards/chart-label";

describe("published dashboard chart date labels",()=>{
  it("keeps date-only values in yyyy-MM-dd format",()=>{
    expect(formatChartLabel("2026-07-27")).toBe("2026-07-27");
    expect(formatChartLabel("2026-07-27T00:00:00.000+07:00")).toBe("2026-07-27");
  });

  it("converts serialized UTC instants back to Bangkok business time",()=>{
    expect(formatChartLabel("2026-07-26T17:00:00.000Z")).toBe("2026-07-27");
    expect(formatChartLabel("2026-07-27T08:45:00Z")).toBe("2026-07-27 15:45");
  });

  it("shows hours and minutes when the timestamp contains a meaningful time",()=>{
    expect(formatChartLabel("2026-07-27 08:45:00")).toBe("2026-07-27 08:45");
  });

  it("retains seconds when they contain information",()=>{
    expect(formatChartLabel("2026-07-27T08:45:19.500+07:00")).toBe("2026-07-27 08:45:19");
  });

  it("does not reinterpret categories or invalid dates",()=>{
    expect(formatChartLabel("Warehouse A")).toBe("Warehouse A");
    expect(formatChartLabel("2026-02-31T00:00:00Z")).toBe("2026-02-31T00:00:00Z");
  });
});
