import { z } from "zod";
import type { ColumnProfile } from "@/lib/business-context/column-profile";
import type { SmartFilterControlType } from "./filter-controls";
import { selectDistributionVisualization } from "./chart-series";

export const generatedDashboardBlockTypes = ["KPI_CARD", "TREND_CHART", "COMPARISON_CHART", "DISTRIBUTION_CHART", "PROGRESS_STATUS", "TABLE", "PIVOT_TABLE", "FUNNEL", "EXCEPTION_LIST", "TEXT_INSIGHT"] as const;
export const datasetShapes = ["SINGLE_VALUE", "VALUE_WITH_CHANGE", "TIME_SERIES", "CATEGORY_COMPARISON", "CATEGORY_DISTRIBUTION", "ACTUAL_VS_TARGET", "DETAIL_RECORDS", "SUMMARY_RECORDS", "MATRIX", "STAGE_FUNNEL", "EXCEPTION_RECORDS", "NARRATIVE_INPUT"] as const;
export type GeneratedDashboardBlockType = typeof generatedDashboardBlockTypes[number];
export type DatasetShape = typeof datasetShapes[number];

export type PlanningField = {
  id: string; businessName: string; physicalColumnName: string; businessType: string; fieldRole: string;
  groupable: boolean; filterable: boolean; searchable: boolean; businessObjectId: string; profile?: ColumnProfile;
};
export type PlanningMetric = {
  id: string; code: string; name: string; description: string | null; businessQuestion: string | null;
  measureType: string; targetValue: string | null; defaultDateFieldId: string | null;
};
export type BusinessQuestionPlan = { id: string; question: string; importance: "HIGH" | "MEDIUM" | "LOW"; recommendedShape: DatasetShape };
export type MetricPlan = { metricKey: string; kpiId: string; name: string; description: string; businessQuestionId: string; dimensions: string[]; timeField?: string; target?: string; businessImportance: "HIGH" | "MEDIUM" };
export type BlockPlan = {
  id: string; type: GeneratedDashboardBlockType; title: string; businessQuestionId?: string; supportingReason?: string;
  metricKey?: string; kpiId?: string; datasetShape: DatasetShape; dimensionFieldIds: string[]; timeFieldId?: string;
  timeGrain?: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR"; visualizationType: string;
  orderedStages?: string[];
  position: { x: number; y: number; w: number; h: number }; suitability: BlockSuitabilityScore;
};
export type FilterPlan = { fieldId: string; label: string; controlType: SmartFilterControlType; affectedPlanBlockIds: string[]; reason: string };
export type DashboardPlan = { title: string; description: string; businessObjective: string; audience: "EXECUTIVE" | "MANAGER" | "OPERATIONAL" | "ANALYST"; primaryMetricKey: string; businessQuestions: BusinessQuestionPlan[]; metrics: MetricPlan[]; filters: FilterPlan[]; blocks: BlockPlan[]; layout: { columns: 12; responsive: "STACK"; rows: number } };

export function simplerBlockCandidates(candidate: BlockPlan): BlockPlan[] {
  if (candidate.type === "TEXT_INSIGHT") return [];
  const alternatives: BlockPlan[] = [];
  const dimensionFieldId = candidate.timeFieldId ?? candidate.dimensionFieldIds[0];
  if (dimensionFieldId && candidate.type !== "TABLE") {
    alternatives.push({
      ...candidate,
      id: `${candidate.id}-table-fallback`,
      type: "TABLE",
      title: `${candidate.title} — Summary`,
      datasetShape: "SUMMARY_RECORDS",
      dimensionFieldIds: [dimensionFieldId],
      timeFieldId: undefined,
      timeGrain: undefined,
      visualizationType: "TABLE",
      suitability: scoreBlockSuitability({ blockType:"TABLE", businessRelevance:85, dataQuality:85, informationValue:75, visualizationFit:85, actionability:90, audienceFit:80, reasons:["Simplified after the preferred visualization could not produce a valid dataset"] }),
    });
  }
  if (candidate.kpiId && candidate.type !== "KPI_CARD") {
    alternatives.push({
      ...candidate,
      id: `${candidate.id}-kpi-fallback`,
      type: "KPI_CARD",
      title: `${candidate.title} — Total`,
      datasetShape: "SINGLE_VALUE",
      dimensionFieldIds: [],
      timeFieldId: undefined,
      timeGrain: undefined,
      visualizationType: "NUMBER",
      position: { ...candidate.position, w: Math.min(4, candidate.position.w), h: 2 },
      suitability: scoreBlockSuitability({ blockType:"KPI_CARD", businessRelevance:80, dataQuality:90, informationValue:70, visualizationFit:90, actionability:65, audienceFit:85, reasons:["Reduced to a governed single-value result after richer dataset shapes failed"] }),
    });
  }
  return alternatives;
}

export type BlockDefinition = { type: GeneratedDashboardBlockType; supportedShapes: DatasetShape[]; minMeasures: number; maxMeasures?: number; minDimensions: number; maxDimensions?: number; requiresTimeDimension?: boolean; requiresTarget?: boolean; requiresOrderedStages?: boolean; requiresExceptionCondition?: boolean; maximumRecommendedCategories?: number };
export const BLOCK_REGISTRY: Record<GeneratedDashboardBlockType, BlockDefinition> = {
  KPI_CARD:{type:"KPI_CARD",supportedShapes:["SINGLE_VALUE","VALUE_WITH_CHANGE"],minMeasures:1,maxMeasures:2,minDimensions:0,maxDimensions:0},
  TREND_CHART:{type:"TREND_CHART",supportedShapes:["TIME_SERIES"],minMeasures:1,maxMeasures:3,minDimensions:0,requiresTimeDimension:true},
  COMPARISON_CHART:{type:"COMPARISON_CHART",supportedShapes:["CATEGORY_COMPARISON"],minMeasures:1,maxMeasures:3,minDimensions:1,maxDimensions:1,maximumRecommendedCategories:15},
  DISTRIBUTION_CHART:{type:"DISTRIBUTION_CHART",supportedShapes:["CATEGORY_DISTRIBUTION"],minMeasures:1,maxMeasures:1,minDimensions:1,maxDimensions:1,maximumRecommendedCategories:15},
  PROGRESS_STATUS:{type:"PROGRESS_STATUS",supportedShapes:["ACTUAL_VS_TARGET"],minMeasures:1,minDimensions:0,requiresTarget:true},
  TABLE:{type:"TABLE",supportedShapes:["DETAIL_RECORDS","SUMMARY_RECORDS"],minMeasures:0,minDimensions:1},
  PIVOT_TABLE:{type:"PIVOT_TABLE",supportedShapes:["MATRIX"],minMeasures:1,minDimensions:2},
  FUNNEL:{type:"FUNNEL",supportedShapes:["STAGE_FUNNEL"],minMeasures:1,minDimensions:1,requiresOrderedStages:true},
  EXCEPTION_LIST:{type:"EXCEPTION_LIST",supportedShapes:["EXCEPTION_RECORDS"],minMeasures:0,minDimensions:1,requiresExceptionCondition:true},
  TEXT_INSIGHT:{type:"TEXT_INSIGHT",supportedShapes:["NARRATIVE_INPUT"],minMeasures:0,minDimensions:0},
};

export type BlockSuitabilityScore = { blockType: GeneratedDashboardBlockType; totalScore: number; businessRelevance: number; dataQuality: number; informationValue: number; visualizationFit: number; actionability: number; audienceFit: number; reasons: string[]; warnings: string[] };
export function scoreBlockSuitability(input:{blockType:GeneratedDashboardBlockType;businessRelevance:number;dataQuality:number;informationValue:number;visualizationFit:number;actionability:number;audienceFit:number;reasons?:string[];warnings?:string[]}):BlockSuitabilityScore{
  const clamp=(value:number)=>Math.max(0,Math.min(100,value));
  const totalScore=Math.round(clamp(input.businessRelevance)*.3+clamp(input.dataQuality)*.2+clamp(input.informationValue)*.15+clamp(input.visualizationFit)*.15+clamp(input.actionability)*.1+clamp(input.audienceFit)*.1);
  return {...input,businessRelevance:clamp(input.businessRelevance),dataQuality:clamp(input.dataQuality),informationValue:clamp(input.informationValue),visualizationFit:clamp(input.visualizationFit),actionability:clamp(input.actionability),audienceFit:clamp(input.audienceFit),totalScore,reasons:input.reasons??[],warnings:input.warnings??[]};
}

export function validateBlockRequirement(input:{blockType:GeneratedDashboardBlockType;shape:DatasetShape;measureCount:number;dimensionCount:number;hasTimeDimension:boolean;hasTarget:boolean;hasOrderedStages:boolean;hasExceptionCondition:boolean;categoryCount?:number}){
  const definition=BLOCK_REGISTRY[input.blockType];const issues:string[]=[];
  if(!definition.supportedShapes.includes(input.shape))issues.push(`${input.blockType} does not support ${input.shape}`);
  if(input.measureCount<definition.minMeasures)issues.push(`At least ${definition.minMeasures} measure is required`);
  if(definition.maxMeasures!==undefined&&input.measureCount>definition.maxMeasures)issues.push(`At most ${definition.maxMeasures} measures are supported`);
  if(input.dimensionCount<definition.minDimensions)issues.push(`At least ${definition.minDimensions} dimension is required`);
  if(definition.maxDimensions!==undefined&&input.dimensionCount>definition.maxDimensions)issues.push(`At most ${definition.maxDimensions} dimensions are supported`);
  if(definition.requiresTimeDimension&&!input.hasTimeDimension)issues.push("A time dimension is required");
  if(definition.requiresTarget&&!input.hasTarget)issues.push("A governed target is required");
  if(definition.requiresOrderedStages&&!input.hasOrderedStages)issues.push("Ordered business stages are required");
  if(definition.requiresExceptionCondition&&!input.hasExceptionCondition)issues.push("A verifiable exception condition is required");
  if(definition.maximumRecommendedCategories&&input.categoryCount&&input.categoryCount>definition.maximumRecommendedCategories)issues.push(`Limit categories to ${definition.maximumRecommendedCategories} or use Top N and Others`);
  return {valid:issues.length===0,issues};
}

export function fieldInformationScore(field:PlanningField){const profile=field.profile;if(!profile)return 65;if(profile.nonNullCount===0||profile.nullRatio>=.98||profile.distinctCount<=1)return 0;if(profile.numericCount>0&&profile.zeroCount===profile.numericCount)return 0;if(profile.numericCount>1&&profile.standardDeviation===0)return 0;const completeness=(1-profile.nullRatio)*45;const variation=Math.min(35,Math.log2(profile.distinctCount+1)*7);const semantic=["STATUS_DIMENSION","DATE_DIMENSION","MEASURE"].includes(field.fieldRole)?20:12;return Math.round(Math.min(100,completeness+variation+semantic));}
export function isEligiblePlanningField(field:PlanningField){const score=fieldInformationScore(field);const technical=field.fieldRole==="TECHNICAL_FIELD"||/(^|_)(OBJID|OBJVERSION|ROWKEY|ROWVERSION|ROWNUM|SEQUENCE|HASH|CHECKSUM)(_|$)/i.test(field.physicalColumnName);return {eligible:!technical&&score>0,informationScore:technical?0:score,exclusionReason:technical?"Technical metadata":score===0?"Constant, empty, zero-only, or near-empty profile":undefined};}

const controlFor=(field:PlanningField):SmartFilterControlType=>{if(["DATE","DATETIME"].includes(field.businessType))return"DATE_RANGE_PICKER";if(field.businessType==="BOOLEAN")return"TOGGLE";const count=field.profile?.distinctCount??0;if(count>100||field.searchable)return"ASYNC_SEARCHABLE_MULTI_SELECT";if(count>10)return"SEARCHABLE_MULTI_SELECT";return"MULTI_SELECT";};
const grainFor=(profile?:ColumnProfile)=>{if(!profile?.minimum||!profile.maximum)return"MONTH" as const;const days=Math.abs((new Date(String(profile.maximum)).getTime()-new Date(String(profile.minimum)).getTime())/86_400_000);return days<=31?"DAY" as const:days<=180?"WEEK" as const:days<=730?"MONTH" as const:days<=1460?"QUARTER" as const:"YEAR" as const;};
const audience=(value:string):DashboardPlan["audience"]=>/executive|ผู้บริหาร/i.test(value)?"EXECUTIVE":/analyst|วิเคราะห์/i.test(value)?"ANALYST":/operation|ปฏิบัติ/i.test(value)?"OPERATIONAL":"MANAGER";

export function composeDashboardPlan(input:{title:string;description:string;businessObjective:string;targetAudience:string;requestedQuestions:string[];metrics:PlanningMetric[];fields:PlanningField[]}):DashboardPlan{
  const eligible=input.fields.filter(field=>isEligiblePlanningField(field).eligible);const dates=eligible.filter(field=>["DATE","DATETIME"].includes(field.businessType)||field.fieldRole==="DATE_DIMENSION");const statuses=eligible.filter(field=>field.fieldRole==="STATUS_DIMENSION"||field.businessType==="STATUS");const dimensions=eligible.filter(field=>field.groupable&&!["DATE","DATETIME","NUMBER","CURRENCY","PERCENTAGE","QUANTITY","DURATION"].includes(field.businessType)&&field.fieldRole!=="IDENTIFIER");
  const questions:BusinessQuestionPlan[]=(input.requestedQuestions.length?input.requestedQuestions:[`What is the current ${input.metrics[0]?.name??"business performance"}?`]).map((question,index)=>({id:`BQ-${String(index+1).padStart(3,"0")}`,question,importance:index<2?"HIGH":"MEDIUM",recommendedShape:index===0?"SINGLE_VALUE":"CATEGORY_COMPARISON"}));
  const ensureQuestion=(question:string,shape:DatasetShape)=>{const found=questions.find(item=>item.recommendedShape===shape);if(found)return found;const item:BusinessQuestionPlan={id:`BQ-${String(questions.length+1).padStart(3,"0")}`,question,importance:"HIGH",recommendedShape:shape};questions.push(item);return item;};
  const metricPlans=input.metrics.map((metric,index)=>({metricKey:metric.code||`metric_${index+1}`,kpiId:metric.id,name:metric.name,description:metric.description??metric.name,businessQuestionId:questions[Math.min(index,questions.length-1)].id,dimensions:dimensions.slice(0,4).map(field=>field.id),...(metric.defaultDateFieldId||dates[0]?{timeField:metric.defaultDateFieldId??dates[0].id}:{}),...(metric.targetValue?{target:metric.targetValue}:{}),businessImportance:index===0?"HIGH" as const:"MEDIUM" as const}));
  const blocks:BlockPlan[]=[];let row=0;const add=(partial:Omit<BlockPlan,"id"|"suitability">,fit:number,reason:string)=>{const blockType=partial.type;const suitability=scoreBlockSuitability({blockType,businessRelevance:90,dataQuality:80,informationValue:80,visualizationFit:fit,actionability:["TABLE","EXCEPTION_LIST","PROGRESS_STATUS"].includes(blockType)?90:70,audienceFit:85,reasons:[reason]});if(suitability.totalScore<60)return;blocks.push({...partial,id:`plan-block-${blocks.length+1}`,suitability});};
  metricPlans.slice(0,3).forEach((metric,index)=>add({type:"KPI_CARD",title:metric.name,businessQuestionId:metric.businessQuestionId,metricKey:metric.metricKey,kpiId:metric.kpiId,datasetShape:"SINGLE_VALUE",dimensionFieldIds:[],visualizationType:"NUMBER",position:{x:index*4,y:0,w:4,h:2}},95,"Primary governed metric summary"));row=2;
  const primary=metricPlans[0];const date=eligible.find(field=>field.id===primary?.timeField)||dates[0];if(primary&&date){const question=ensureQuestion(`How is ${primary.name} changing over time?`,"TIME_SERIES");add({type:"TREND_CHART",title:`${primary.name} Trend`,businessQuestionId:question.id,metricKey:primary.metricKey,kpiId:primary.kpiId,datasetShape:"TIME_SERIES",dimensionFieldIds:[],timeFieldId:date.id,timeGrain:grainFor(date.profile),visualizationType:"LINE",position:{x:0,y:row,w:8,h:4}},95,"A varying time dimension supports trend analysis");}
  const status=statuses[0];if(primary&&status){const question=ensureQuestion(`How is ${primary.name} distributed by ${status.businessName}?`,"CATEGORY_DISTRIBUTION");add({type:"DISTRIBUTION_CHART",title:`${primary.name} by ${status.businessName}`,businessQuestionId:question.id,metricKey:primary.metricKey,kpiId:primary.kpiId,datasetShape:"CATEGORY_DISTRIBUTION",dimensionFieldIds:[status.id],visualizationType:selectDistributionVisualization(status.profile?.distinctCount),position:{x:8,y:row,w:4,h:4}},92,"Status is a meaningful categorical breakdown");}row+=4;
  const orderedStages=status?.profile?.sampleValues.filter(Boolean).slice(0,8)??[];if(primary&&status&&orderedStages.length>=3){const question=ensureQuestion(`How does ${primary.name} progress through ${status.businessName} stages?`,"STAGE_FUNNEL");add({type:"FUNNEL",title:`${primary.name} Funnel by ${status.businessName}`,businessQuestionId:question.id,metricKey:primary.metricKey,kpiId:primary.kpiId,datasetShape:"STAGE_FUNNEL",dimensionFieldIds:[status.id],visualizationType:"FUNNEL",orderedStages,position:{x:0,y:row,w:5,h:4}},91,"Profiled status values provide data-backed ordered stages");row+=4;}
  const comparison=dimensions.find(field=>field.id!==status?.id);if(primary&&comparison){const question=ensureQuestion(`Which ${comparison.businessName} contributes most to ${primary.name}?`,"CATEGORY_COMPARISON");add({type:"COMPARISON_CHART",title:`${primary.name} by ${comparison.businessName}`,businessQuestionId:question.id,metricKey:primary.metricKey,kpiId:primary.kpiId,datasetShape:"CATEGORY_COMPARISON",dimensionFieldIds:[comparison.id],visualizationType:"HORIZONTAL_BAR",position:{x:0,y:row,w:7,h:4}},90,"Top-N comparison reveals the main contributors");}
  const tableDimension=status??comparison??dimensions[0];if(primary&&tableDimension){const question=ensureQuestion(`Where should users focus attention for ${primary.name}?`,"SUMMARY_RECORDS");add({type:"TABLE",title:`${primary.name} — Action Summary`,businessQuestionId:question.id,metricKey:primary.metricKey,kpiId:primary.kpiId,datasetShape:"SUMMARY_RECORDS",dimensionFieldIds:[tableDimension.id],visualizationType:"TABLE",position:{x:7,y:row,w:5,h:4}},86,"A ranked summary supports follow-up action");}row+=4;
  if(primary?.target){const question=ensureQuestion(`Is ${primary.name} meeting its governed target?`,"ACTUAL_VS_TARGET");add({type:"PROGRESS_STATUS",title:`${primary.name} vs Target`,businessQuestionId:question.id,metricKey:primary.metricKey,kpiId:primary.kpiId,datasetShape:"ACTUAL_VS_TARGET",dimensionFieldIds:[],visualizationType:"PROGRESS",position:{x:0,y:row,w:4,h:3}},94,"A governed target is configured for this metric");}
  add({type:"TEXT_INSIGHT",title:"Operational Insight",supportingReason:"Summarizes validated source blocks after execution",datasetShape:"NARRATIVE_INPUT",dimensionFieldIds:[],visualizationType:"TEXT",position:{x:primary?.target?4:0,y:row,w:primary?.target?8:12,h:3}},88,"Narrative is derived from executed source block results");row+=3;
  while(blocks.filter(block=>block.type==="KPI_CARD").length>1&&blocks.filter(block=>block.type==="KPI_CARD").length/blocks.length>.4){const index=blocks.findLastIndex(block=>block.type==="KPI_CARD");blocks.splice(index,1);}
  const blockIds=blocks.filter(block=>block.type!=="TEXT_INSIGHT").map(block=>block.id);const filters=eligible.filter(field=>field.filterable&&(["DATE_DIMENSION","STATUS_DIMENSION"].includes(field.fieldRole)||field.searchable||field===comparison)).slice(0,5).map(field=>({fieldId:field.id,label:field.businessName,controlType:controlFor(field),affectedPlanBlockIds:blockIds,reason:`${field.businessName} is an eligible ${field.fieldRole.toLowerCase()} used by generated datasets.`}));
  return {title:input.title,description:input.description,businessObjective:input.businessObjective,audience:audience(input.targetAudience),primaryMetricKey:metricPlans[0]?.metricKey??"",businessQuestions:questions,metrics:metricPlans,filters,blocks,layout:{columns:12,responsive:"STACK",rows:row}};
}

export type DatasetValidationResult={valid:boolean;rowCount:number;columnCount:number;allValuesNull:boolean;allValuesZero:boolean;constantSeries:boolean;duplicateCategories:boolean;excessiveCategories:boolean;missingTimePeriods:boolean;warnings:string[];recommendedAction:"KEEP"|"REPAIR_QUERY"|"CHANGE_BLOCK_TYPE"|"REMOVE_BLOCK"};
export function validateDatasetRows(rows:Array<Record<string,unknown>>,shape:DatasetShape):DatasetValidationResult{
  const values=rows.flatMap(row=>Object.values(row));const numeric=values.map(Number).filter(Number.isFinite);const categories=rows.map(row=>String(row.DIMENSION_VALUE??row.dimension_value??"")).filter(Boolean);const allValuesNull=values.length===0||values.every(value=>value==null);const allValuesZero=numeric.length>0&&numeric.every(value=>value===0);const constantSeries=numeric.length>1&&new Set(numeric).size===1;const duplicateCategories=categories.length>0&&new Set(categories).size<categories.length;const excessiveCategories=categories.length>15;const warnings:string[]=[];if(!rows.length)warnings.push(shape==="EXCEPTION_RECORDS"?"No exception records match the current filters.":"The query returned no rows.");if(allValuesNull)warnings.push("All returned values are null.");if(allValuesZero)warnings.push("All numeric values are zero; verify that zero is meaningful.");if(constantSeries&&shape==="TIME_SERIES")warnings.push("The time series is constant.");if(rows.length<2&&shape==="TIME_SERIES")warnings.push("Not enough historical data to display a trend.");if(duplicateCategories)warnings.push("Duplicate categories were returned.");if(excessiveCategories)warnings.push("More than 15 categories were returned; use Top N and Others.");const invalid=allValuesNull||(shape==="TIME_SERIES"&&rows.length<2)||(shape==="CATEGORY_DISTRIBUTION"&&categories.length<2);return{valid:!invalid,rowCount:rows.length,columnCount:Object.keys(rows[0]??{}).length,allValuesNull,allValuesZero,constantSeries,duplicateCategories,excessiveCategories,missingTimePeriods:false,warnings,recommendedAction:allValuesNull?"REMOVE_BLOCK":shape==="TIME_SERIES"&&rows.length<2?"CHANGE_BLOCK_TYPE":excessiveCategories?"REPAIR_QUERY":"KEEP"};
}

export type DashboardQualityResult={passed:boolean;score:number;checks:{hasPrimaryMetric:boolean;hasTrend:boolean;hasBreakdown:boolean;hasActionableBlock:boolean;hasInsight:boolean;hasDetailBlock:boolean;hasCompatibleFilters:boolean;excessiveKpiCards:boolean;duplicatedMetrics:boolean;duplicatedBlocks:boolean;unsupportedTargets:boolean;emptyDatasets:boolean;constantValueBlocks:boolean;lowInformationBlocks:boolean;excessiveCategories:boolean;balancedLayout:boolean;unusedSpace:boolean;orphanFilters:boolean};issues:Array<{code:string;severity:"ERROR"|"WARNING";message:string}>};
export function evaluateDashboardQuality(blocks:Array<{id:string;type:GeneratedDashboardBlockType;metricKey?:string;datasetValidation?:DatasetValidationResult;position:{x:number;y:number;w:number;h:number};suitabilityScore?:number}>,filters:Array<{affectedPlanBlockIds:string[]}>):DashboardQualityResult{
  const nonInsight=blocks.filter(block=>block.type!=="TEXT_INSIGHT");const metricKeys=nonInsight.map(block=>block.metricKey).filter(Boolean);const blockKeys=blocks.map(block=>`${block.type}:${block.metricKey??""}`);const covered=new Set(filters.flatMap(filter=>filter.affectedPlanBlockIds));const checks={hasPrimaryMetric:blocks.some(block=>block.type==="KPI_CARD"),hasTrend:blocks.some(block=>block.type==="TREND_CHART"),hasBreakdown:blocks.filter(block=>["COMPARISON_CHART","DISTRIBUTION_CHART"].includes(block.type)).length>=2,hasActionableBlock:blocks.some(block=>["TABLE","PIVOT_TABLE","EXCEPTION_LIST"].includes(block.type)),hasInsight:blocks.some(block=>block.type==="TEXT_INSIGHT"),hasDetailBlock:blocks.some(block=>["TABLE","PIVOT_TABLE","EXCEPTION_LIST"].includes(block.type)),hasCompatibleFilters:!filters.length||nonInsight.every(block=>covered.has(block.id)),excessiveKpiCards:blocks.filter(block=>block.type==="KPI_CARD").length/Math.max(1,blocks.length)>.4,duplicatedMetrics:new Set(metricKeys).size<metricKeys.length&&new Set(blockKeys).size<blockKeys.length,duplicatedBlocks:new Set(blockKeys).size<blockKeys.length,unsupportedTargets:false,emptyDatasets:blocks.some(block=>block.datasetValidation?.rowCount===0),constantValueBlocks:blocks.some(block=>block.datasetValidation?.constantSeries),lowInformationBlocks:blocks.some(block=>(block.suitabilityScore??100)<60),excessiveCategories:blocks.some(block=>block.datasetValidation?.excessiveCategories),balancedLayout:blocks.every(block=>block.position.x+block.position.w<=12),unusedSpace:false,orphanFilters:filters.some(filter=>!filter.affectedPlanBlockIds.length)};
  const issues:Array<{code:string;severity:"ERROR"|"WARNING";message:string}>=[];if(!checks.hasPrimaryMetric)issues.push({code:"PRIMARY_METRIC_REQUIRED",severity:"ERROR",message:"Dashboard requires a primary metric."});if(!checks.hasCompatibleFilters||checks.orphanFilters)issues.push({code:"FILTER_COMPATIBILITY",severity:"ERROR",message:"Every generated filter must affect at least one compatible block."});if(checks.emptyDatasets)issues.push({code:"EMPTY_DATASET",severity:"ERROR",message:"One or more required datasets are empty."});if(checks.lowInformationBlocks)issues.push({code:"LOW_SUITABILITY",severity:"ERROR",message:"Blocks scoring below 60 cannot be generated."});if(!checks.hasTrend)issues.push({code:"TREND_UNAVAILABLE",severity:"WARNING",message:"No valid time-series block is available."});if(!checks.hasBreakdown)issues.push({code:"BREAKDOWN_COVERAGE",severity:"WARNING",message:"Add comparison or distribution coverage when data supports it."});if(!checks.hasActionableBlock)issues.push({code:"ACTIONABLE_BLOCK",severity:"WARNING",message:"No actionable detail or summary block is available."});if(checks.excessiveKpiCards)issues.push({code:"EXCESSIVE_KPI_CARDS",severity:"ERROR",message:"KPI cards may not exceed 40% of generated blocks."});if(checks.duplicatedBlocks)issues.push({code:"DUPLICATED_BLOCK",severity:"WARNING",message:"Duplicate block intent was detected."});if(!checks.balancedLayout)issues.push({code:"LAYOUT_OVERFLOW",severity:"ERROR",message:"A block exceeds the 12-column grid."});const score=Math.max(0,100-issues.reduce((sum,issue)=>sum+(issue.severity==="ERROR"?15:5),0));return{passed:!issues.some(issue=>issue.severity==="ERROR")&&score>=60,score,checks,issues};
}

export const dashboardPlanningOutputSchema=z.object({dashboard:z.object({title:z.string(),description:z.string(),businessObjective:z.string(),audience:z.enum(["EXECUTIVE","MANAGER","OPERATIONAL","ANALYST"])}),businessQuestions:z.array(z.object({id:z.string(),question:z.string(),importance:z.enum(["HIGH","MEDIUM","LOW"]),recommendedShape:z.enum(datasetShapes)})),metrics:z.array(z.object({metricKey:z.string(),kpiId:z.string().uuid()})),recommendedFilters:z.array(z.object({fieldId:z.string().uuid(),controlType:z.string()})),blockCandidates:z.array(z.object({type:z.enum(generatedDashboardBlockTypes),datasetShape:z.enum(datasetShapes),kpiId:z.string().uuid().optional(),dimensionFieldIds:z.array(z.string().uuid())})),selectedBlocks:z.array(z.string()),layout:z.object({columns:z.literal(12)}),filterCompatibility:z.array(z.object({blockId:z.string(),supportedFilterIds:z.array(z.string())})),qualityExpectations:z.record(z.string(),z.unknown())}).strict();
