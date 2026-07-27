import {describe,expect,it} from "vitest";
import {buildDynamicInsight,type InsightBlock} from "../lib/dashboards/dynamic-insight";

const block=(input:Partial<InsightBlock>&Pick<InsightBlock,"id"|"title"|"blockType"|"visualizationType">):InsightBlock=>({description:null,businessQuestion:null,decisionSupported:null,position:{x:0,y:0,w:6,h:4},...input});
const stock=block({id:"stock",title:"Current Inventory Position",blockType:"KPI_CARD",visualizationType:"NUMBER",position:{x:0,y:0,w:4,h:3}});
const warehouse=block({id:"warehouse",title:"Inventory by Warehouse",blockType:"DISTRIBUTION_CHART",visualizationType:"BAR",position:{x:4,y:0,w:8,h:4}});
const trend=block({id:"trend",title:"Inventory Movement Over Time",blockType:"TREND_CHART",visualizationType:"LINE",position:{x:0,y:4,w:12,h:4}});

describe("published dashboard dynamic insights",()=>{
  it("selects a distribution source for a location-focused insight",()=>{
    const insight=block({id:"where",title:"Where is stock concentrated?",businessQuestion:"Which warehouse holds the most inventory?",blockType:"TEXT_INSIGHT",visualizationType:"TEXT",position:{x:0,y:8,w:12,h:2}});
    const output=buildDynamicInsight(insight,[stock,warehouse,trend,insight],{stock:{rows:[{KPI_VALUE:300}]},warehouse:{rows:[{DIMENSION_VALUE:"A",KPI_VALUE:80},{DIMENSION_VALUE:"B",KPI_VALUE:20}]},trend:{rows:[{DIMENSION_VALUE:"2026-01-01",KPI_VALUE:90},{DIMENSION_VALUE:"2026-02-01",KPI_VALUE:100}]}});
    expect(output?.sourceBlockId).toBe("warehouse");
    expect(output?.text).toContain("A is the largest visible contributor");
    expect(output?.text).toContain("80%");
  });

  it("describes a trend with its actual direction and date range",()=>{
    const insight=block({id:"movement",title:"How is inventory changing over time?",blockType:"TEXT_INSIGHT",visualizationType:"TEXT",position:{x:0,y:8,w:12,h:2}});
    const output=buildDynamicInsight(insight,[stock,warehouse,trend,insight],{stock:{rows:[{KPI_VALUE:300}]},warehouse:{rows:[{DIMENSION_VALUE:"A",KPI_VALUE:80}]},trend:{rows:[{DIMENSION_VALUE:"2026-01-01T00:00:00Z",KPI_VALUE:90},{DIMENSION_VALUE:"2026-02-01T00:00:00Z",KPI_VALUE:120}]}});
    expect(output?.sourceBlockId).toBe("trend");
    expect(output?.text).toContain("increased by 30");
    expect(output?.text).toContain("2026-02-01");
  });

  it("reports table row counts without inferring causes",()=>{
    const exceptions=block({id:"exceptions",title:"Low Stock Items",blockType:"EXCEPTION_LIST",visualizationType:"TABLE",position:{x:0,y:4,w:12,h:4}});
    const insight=block({id:"risk",title:"Which stock risk needs attention?",decisionSupported:"Prioritize replenishment",blockType:"TEXT_INSIGHT",visualizationType:"TEXT",position:{x:0,y:8,w:12,h:2}});
    const output=buildDynamicInsight(insight,[stock,exceptions,insight],{stock:{rows:[{KPI_VALUE:300}]},exceptions:{rows:[{PART:"A"},{PART:"B"}],rowCount:12}});
    expect(output?.sourceBlockId).toBe("exceptions");
    expect(output?.text).toContain("12 visible records");
    expect(output?.note).toContain("No cause is inferred");
  });

  it("uses different sources for duplicate text insight blocks",()=>{
    const first=block({id:"insight-1",title:"Operational Insight",description:"Summarizes validated source blocks after execution",blockType:"TEXT_INSIGHT",visualizationType:"TEXT",position:{x:0,y:10,w:12,h:3}});
    const second={...first,id:"insight-2"};
    const results={stock:{rows:[{KPI_VALUE:300}]},warehouse:{rows:[{DIMENSION_VALUE:"A",KPI_VALUE:80}]},trend:{rows:[{DIMENSION_VALUE:"2026-01-01",KPI_VALUE:90},{DIMENSION_VALUE:"2026-02-01",KPI_VALUE:100}]}};
    const blocks=[stock,warehouse,trend,first,second];
    expect(buildDynamicInsight(first,blocks,results)?.sourceBlockId).not.toBe(buildDynamicInsight(second,blocks,results)?.sourceBlockId);
  });

  it("keeps a data availability note as governed explanatory content",()=>{
    const note=block({id:"availability",title:"Data Availability Note",description:"Richer visualizations that could not produce valid governed previews were skipped.",blockType:"TEXT_INSIGHT",visualizationType:"TEXT"});
    const output=buildDynamicInsight(note,[stock,note],{stock:{rows:[{KPI_VALUE:300}]}});
    expect(output?.sourceBlockId).toBeNull();
    expect(output?.eyebrow).toBe("DATA AVAILABILITY");
    expect(output?.text).toBe(note.description);
  });
});
