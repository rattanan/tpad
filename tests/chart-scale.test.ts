import {describe,expect,it} from "vitest";
import {createYAxisScale} from "../lib/dashboards/chart-scale";

describe("published dashboard Y-axis scale",()=>{
  it("starts positive-only charts at zero",()=>{
    const scale=createYAxisScale([12,30,18]);
    expect(scale.minimum).toBe(0);
    expect(scale.maximum).toBe(30);
    expect(scale.ticks).toEqual([30,22.5,15,7.5,0]);
  });

  it("keeps a zero baseline for negative-only charts",()=>{
    const scale=createYAxisScale([-20,-5,-12]);
    expect(scale.minimum).toBe(-20);
    expect(scale.maximum).toBe(0);
    expect(scale.range).toBe(20);
  });

  it("supports mixed values and ignores non-finite input",()=>{
    const scale=createYAxisScale([-10,25,Number.NaN,Number.POSITIVE_INFINITY]);
    expect(scale.minimum).toBe(-10);
    expect(scale.maximum).toBe(25);
    expect(scale.ticks.at(-1)).toBe(-10);
  });

  it("uses a readable non-negative scale when every value is zero",()=>{
    const scale=createYAxisScale([0,0]);
    expect(scale.minimum).toBe(0);
    expect(scale.maximum).toBe(1);
    expect(scale.ticks.at(-1)).toBe(0);
  });
});
