import {describe,expect,it} from "vitest";
import {formatKpiValue} from "../lib/dashboards/kpi-value-format";

describe("KPI card value formatting",()=>{
  it("removes decimals from long values",()=>expect(formatKpiValue(123456.789).display).toBe("123,457"));
  it("compacts values that would overflow a KPI card",()=>expect(formatKpiValue(1234567890).display).toBe("1.2B"));
  it("keeps useful precision for small values",()=>expect(formatKpiValue(12.345).display).toBe("12.35"));
  it("preserves the original value for the accessible tooltip",()=>expect(formatKpiValue("123456.789").full).toBe("123456.789"));
});
