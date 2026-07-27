import {describe,expect,it} from "vitest";
import {planGeneratedAutoRepair} from "../lib/dashboards/auto-repair";

describe("generated dashboard auto repair",()=>{
  it("removes only generated blocks with safely repairable validation errors",()=>{const result=planGeneratedAutoRepair([{severity:"ERROR",code:"PREVIEW_REQUIRED",dashboardBlockId:"generated"},{severity:"ERROR",code:"PREVIEW_REQUIRED",dashboardBlockId:"user-block"},{severity:"WARNING",code:"DATASET_SHAPE_INVALID",dashboardBlockId:"warning"}],new Set(["generated","warning"]),[]);expect(result.blockIds).toEqual(["generated"]);});
  it("removes only filters created in the current generation when compatibility fails",()=>{const result=planGeneratedAutoRepair([{severity:"ERROR",code:"FILTER_COMPATIBILITY"}],[],["generated-filter"]);expect(result.filterIds).toEqual(["generated-filter"]);});
  it("does not auto-fix business decisions",()=>{const result=planGeneratedAutoRepair([{severity:"ERROR",code:"PRIMARY_METRIC_REQUIRED"}],[],["filter"]);expect(result).toEqual({blockIds:[],filterIds:[]});});
});
