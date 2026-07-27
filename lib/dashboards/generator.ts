import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { businessFields, dashboardVersions, kpiDefinitions, kpiSourceFields } from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/http";
import { sanitizeMetadataText } from "@/lib/business-context/security";
import { summarizeColumnProfile } from "@/lib/business-context/column-profile";
import { previewDashboardBlock } from "./query";
import { addDashboardBlock, addGlobalFilter, createDashboard, getDashboardWorkspace, removeDashboardBlock, validateDashboard } from "./service";
import { recommendFilterConfiguration } from "./filter-controls";
import { composeDashboardPlan, dashboardPlanningOutputSchema, evaluateDashboardQuality, isEligiblePlanningField, type DashboardPlan, type DatasetValidationResult, type PlanningField, type PlanningMetric } from "./planning";
import { dashboardCreateSchema } from "./validation";

type CreateInput = z.infer<typeof dashboardCreateSchema>;

function parseExamples(value: string | null) {
  try { const parsed = value ? JSON.parse(value) as unknown : []; return Array.isArray(parsed) ? parsed.slice(0, 2_000) : []; }
  catch { return []; }
}

async function planningMetadata(modelId: string) {
  const [kpis, fields, metricSources] = await Promise.all([
    db.select({ id:kpiDefinitions.id, code:kpiDefinitions.code, name:kpiDefinitions.name, description:kpiDefinitions.description, businessQuestion:kpiDefinitions.businessQuestion, measureType:kpiDefinitions.measureType, targetValue:kpiDefinitions.targetValue, defaultDateFieldId:kpiDefinitions.defaultDateFieldId }).from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, modelId), inArray(kpiDefinitions.status, ["APPROVED", "CERTIFIED"]), isNull(kpiDefinitions.deletedAt))).orderBy(asc(kpiDefinitions.name)),
    db.select({ id:businessFields.id, businessName:businessFields.businessName, physicalColumnName:businessFields.physicalColumnName, businessType:businessFields.businessType, fieldRole:businessFields.fieldRole, groupable:businessFields.groupable, filterable:businessFields.filterable, searchable:businessFields.searchable, businessObjectId:businessFields.businessObjectId, physicalDataType:businessFields.physicalDataType, exampleValues:businessFields.exampleValues }).from(businessFields).where(and(eq(businessFields.modelId, modelId), eq(businessFields.approvalStatus, "APPROVED"), eq(businessFields.visibleToDashboardCreator, true), eq(businessFields.aiUsageAllowed, true), eq(businessFields.sensitivityClassification, "NONE"), isNull(businessFields.deletedAt))).orderBy(asc(businessFields.businessName)),
    db.select({kpiId:kpiSourceFields.kpiId,businessFieldId:kpiSourceFields.businessFieldId,role:kpiSourceFields.role}).from(kpiSourceFields).where(and(inArray(kpiSourceFields.kpiId,db.select({id:kpiDefinitions.id}).from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId,modelId),inArray(kpiDefinitions.status,["APPROVED","CERTIFIED"]),isNull(kpiDefinitions.deletedAt)))),isNull(kpiSourceFields.deletedAt))),
  ]);
  const planningFields: PlanningField[] = fields.map((field) => {
    const examples=parseExamples(field.exampleValues);const numeric=/NUMBER|NUMERIC|DECIMAL|INTEGER|INT|FLOAT|DOUBLE|REAL/i.test(field.physicalDataType)||["NUMBER","CURRENCY","PERCENTAGE","QUANTITY","DURATION"].includes(field.businessType);
    return {id:field.id,businessName:field.businessName,physicalColumnName:field.physicalColumnName,businessType:field.businessType,fieldRole:field.fieldRole,groupable:field.groupable,filterable:field.filterable,searchable:field.searchable,businessObjectId:field.businessObjectId,...(examples.length?{profile:summarizeColumnProfile(examples,numeric)}:{})};
  });
  const planningFieldMap=new Map(planningFields.map(field=>[field.id,field]));const usableKpis=kpis.filter(kpi=>{const measureSources=metricSources.filter(source=>source.kpiId===kpi.id&&source.role==="MEASURE");return!measureSources.length||measureSources.every(source=>{const field=planningFieldMap.get(source.businessFieldId);return field&&isEligiblePlanningField(field).eligible;});});
  return { kpis: usableKpis satisfies PlanningMetric[], fields: planningFields };
}

function planningContract(plan: DashboardPlan) {
  return {
    dashboard:{title:plan.title,description:plan.description,businessObjective:plan.businessObjective,audience:plan.audience},
    businessQuestions:plan.businessQuestions,
    metrics:plan.metrics.map(metric=>({metricKey:metric.metricKey,kpiId:metric.kpiId})),
    recommendedFilters:plan.filters.map(filter=>({fieldId:filter.fieldId,controlType:filter.controlType})),
    blockCandidates:plan.blocks.map(block=>({type:block.type,datasetShape:block.datasetShape,...(block.kpiId?{kpiId:block.kpiId}:{}),dimensionFieldIds:block.dimensionFieldIds})),
    selectedBlocks:plan.blocks.map(block=>block.id),layout:{columns:12 as const},
    filterCompatibility:plan.blocks.map(block=>({blockId:block.id,supportedFilterIds:plan.filters.filter(filter=>filter.affectedPlanBlockIds.includes(block.id)).map(filter=>filter.fieldId)})),
    qualityExpectations:{minimumScore:60,kpiCardMaximumShare:.4,requiresBindVariables:true,requiresDatasetValidation:true},
  };
}

async function validatePlanWithAi(context: unknown, deterministicPlan: DashboardPlan) {
  const apiKey=process.env.AI_API_KEY;const baseUrl=process.env.AI_BASE_URL?.replace(/\/$/,"");const model=process.env.AI_MODEL;
  if(!apiKey||!baseUrl||!model)return {usedAi:false,contract:planningContract(deterministicPlan)};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30_000);
  try{
    const response=await fetch(`${baseUrl}/chat/completions`,{method:"POST",signal:controller.signal,headers:{"content-type":"application/json",authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,temperature:.1,response_format:{type:"json_object"},messages:[{role:"system",content:"You are an enterprise Oracle/IFS dashboard planning analyst. Return JSON only and no SQL. Use only supplied KPI and field UUIDs. Preserve the required top-level contract. Reject constant, zero-only, near-empty, technical, or unsupported candidates. Never invent targets, stages, exceptions, fields, metrics, results, or causes. Select blocks only when their dataset shape requirements are satisfied; keep KPI cards at no more than 40 percent and reuse each metric across multiple shapes."},{role:"user",content:JSON.stringify({context,validatedDeterministicCandidate:planningContract(deterministicPlan)})}]})});
    const body=await response.json() as {choices?:Array<{message?:{content?:string}}>};if(!response.ok)return{usedAi:false,contract:planningContract(deterministicPlan)};
    const content=(body.choices?.[0]?.message?.content||"{}").replace(/^```json\s*/i,"").replace(/```$/i,"").trim();
    return {usedAi:true,contract:dashboardPlanningOutputSchema.parse(JSON.parse(content))};
  }catch{return{usedAi:false,contract:planningContract(deterministicPlan)};}finally{clearTimeout(timer);}
}

const visualization=(value:string)=>value as "NUMBER"|"LINE"|"AREA"|"BAR"|"HORIZONTAL_BAR"|"STACKED_BAR"|"DONUT"|"PIE"|"TREEMAP"|"PROGRESS"|"GAUGE"|"BULLET"|"TABLE"|"PIVOT"|"FUNNEL"|"EXCEPTION_LIST"|"TEXT";
async function materializePlan(dashboardId:string,plan:DashboardPlan,user:AuthenticatedUser,existingBlockIds:string[]=[],existingFilterFieldIds=new Set<string>(),aiContract?:unknown){
  const blockMap=new Map<string,string>();const validations=new Map<string,DatasetValidationResult>();let failedPreviewCount=0;
  for(const candidate of plan.blocks){let persistedId:string|undefined;try{
    const metric=plan.metrics.find(item=>item.metricKey===candidate.metricKey);const block=await addDashboardBlock(dashboardId,{blockType:candidate.type,title:sanitizeMetadataText(candidate.title,190),description:sanitizeMetadataText(candidate.supportingReason||candidate.suitability.reasons.join(" "),4000),businessQuestion:sanitizeMetadataText(plan.businessQuestions.find(question=>question.id===candidate.businessQuestionId)?.question||candidate.supportingReason||plan.businessObjective,4000),intendedAudience:plan.audience,decisionSupported:sanitizeMetadataText(plan.businessObjective,4000),kpiId:candidate.kpiId,dimensionFieldId:candidate.timeFieldId||candidate.dimensionFieldIds[0],visualizationType:visualization(candidate.visualizationType),filters:[],visualizationConfig:{datasetShape:candidate.datasetShape,metricKey:candidate.metricKey,businessQuestionId:candidate.businessQuestionId,timeGrain:candidate.timeGrain,dimensionFieldIds:candidate.dimensionFieldIds,targetValue:metric?.target,topN:10,suitability:candidate.suitability,aiReasoningSummary:candidate.suitability.reasons.join(" ")},formattingConfig:{decimalPlaces:2,emptyValue:candidate.type==="EXCEPTION_LIST"?"No exception records match the current filters.":"No data matches the current filters."},position:candidate.position,isHidden:false,isLocked:false},user);persistedId=block.id;blockMap.set(candidate.id,block.id);
    if(candidate.type!=="TEXT_INSIGHT"){const preview=await previewDashboardBlock(dashboardId,block.id,user);const validation=(preview as {datasetValidation?:DatasetValidationResult}).datasetValidation;if(validation){validations.set(candidate.id,validation);if(!validation.valid)throw new Error(validation.warnings.join(" ")||"Dataset validation failed");}}
  }catch{failedPreviewCount+=1;if(persistedId)await removeDashboardBlock(dashboardId,persistedId,user).catch(()=>undefined);blockMap.delete(candidate.id);}}
  const createdBlockIds=[...blockMap.values()];if(!createdBlockIds.some(id=>!existingBlockIds.includes(id)))throw new HttpError(502,"No planned dashboard block could produce a valid data preview. Review KPI formulas, field profiles, and the Data Source connection.","DASHBOARD_PREVIEW_FAILED");
  let filterCount=0;for(const filter of plan.filters){if(existingFilterFieldIds.has(filter.fieldId))continue;const affected=filter.affectedPlanBlockIds.flatMap(id=>blockMap.has(id)?[blockMap.get(id)!]:[]);if(!affected.length)continue;const planningField=(await db.select().from(businessFields).where(eq(businessFields.id,filter.fieldId)).limit(1))[0];if(!planningField)continue;const filterType=["DATE","DATETIME"].includes(planningField.businessType)?"DATE_RANGE" as const:planningField.businessType==="BOOLEAN"?"BOOLEAN" as const:["NUMBER","CURRENCY","PERCENTAGE","QUANTITY","DURATION"].includes(planningField.businessType)?"NUMERIC_RANGE" as const:"MULTI_SELECT" as const;const configuration={...recommendFilterConfiguration(planningField,0,filterType,filterCount),controlType:filter.controlType,selectionMode:filter.controlType.includes("MULTI")||filter.controlType==="CHECKBOX_GROUP"?"MULTIPLE" as const:"SINGLE" as const,searchable:filter.controlType.includes("SEARCHABLE"),searchMode:filter.controlType.startsWith("ASYNC")?"SERVER" as const:"CLIENT" as const,minimumSearchCharacters:filter.controlType.startsWith("ASYNC")?2:0,reason:filter.reason};try{await addGlobalFilter(dashboardId,{name:sanitizeMetadataText(filter.label,160),businessFieldId:filter.fieldId,filterType,appliesToBlockIds:affected,configuration,isRequired:false,isVisible:true,runtimeEditable:true,securityEnforced:false},user);existingFilterFieldIds.add(filter.fieldId);filterCount+=1;}catch{/* Optional recommendations cannot invalidate otherwise valid blocks. */}}
  const qualityBlocks=plan.blocks.filter(block=>blockMap.has(block.id)).map(block=>({id:block.id,type:block.type,metricKey:block.metricKey,datasetValidation:validations.get(block.id),position:block.position,suitabilityScore:block.suitability.totalScore}));const qualityFilters=plan.filters.map(filter=>({affectedPlanBlockIds:filter.affectedPlanBlockIds.filter(id=>blockMap.has(id))})).filter(filter=>filter.affectedPlanBlockIds.length);const quality=evaluateDashboardQuality(qualityBlocks,qualityFilters);
  const workspace=await getDashboardWorkspace(dashboardId,user);await db.update(dashboardVersions).set({layoutJson:JSON.stringify({columns:12,responsive:"stack",generation:{pipelineVersion:2,plan,aiContract,quality,generatedAt:new Date().toISOString()}}),updatedAt:new Date(),updatedBy:user.id}).where(eq(dashboardVersions.id,workspace.version.id));
  return{blockIds:createdBlockIds,blockCount:createdBlockIds.length,filterCount,failedPreviewCount,quality};
}

function makePlan(input:{name:string;description?:string;businessObjective:string;targetAudience:string;businessQuestions:string[]},metadata:Awaited<ReturnType<typeof planningMetadata>>){return composeDashboardPlan({title:sanitizeMetadataText(input.name,190),description:sanitizeMetadataText(input.description||input.businessObjective,1000),businessObjective:sanitizeMetadataText(input.businessObjective,1000),targetAudience:sanitizeMetadataText(input.targetAudience,500),requestedQuestions:input.businessQuestions.map(question=>sanitizeMetadataText(question,500)),metrics:metadata.kpis,fields:metadata.fields});}

export async function generateDashboardWithAi(input:CreateInput,user:AuthenticatedUser){
  if(!hasPermission(user.role,"USE_COPILOT"))throw new HttpError(403,"AI assistance is not permitted","FORBIDDEN");const metadata=await planningMetadata(input.businessContextModelId);if(!metadata.kpis.length)throw new HttpError(409,"The selected Business Context has no approved KPI available for dashboard generation","NO_APPROVED_KPIS");const plan=makePlan(input,metadata);const ai=await validatePlanWithAi({purpose:{name:input.name,objective:input.businessObjective,questions:input.businessQuestions,audience:input.targetAudience},metrics:metadata.kpis,fields:metadata.fields},plan);const created=await createDashboard(input,user);const materialized=await materializePlan(created.dashboardId,plan,user,[],new Set(),ai.contract);const validation=await validateDashboard(created.dashboardId,user);if(validation.outcome==="FAILED"||!materialized.quality.passed)throw new HttpError(409,"Generated dashboard did not pass the quality gate. Open the draft to review its findings.","GENERATED_DASHBOARD_VALIDATION_FAILED");return{...created,...materialized,planningMode:ai.usedAi?"AI_VALIDATED":"DETERMINISTIC_FALLBACK",validationOutcome:validation.outcome,previewPath:`/workspace/dashboards/${created.dashboardId}/edit?step=preview`};
}

export async function generateDraftDashboardWithAi(dashboardId:string,user:AuthenticatedUser){
  if(!hasPermission(user.role,"USE_COPILOT"))throw new HttpError(403,"AI assistance is not permitted","FORBIDDEN");const workspace=await getDashboardWorkspace(dashboardId,user);if(!workspace.permissions.canEdit)throw new HttpError(403,"This dashboard draft cannot be edited","FORBIDDEN");if(!workspace.permissions.canUseAi)throw new HttpError(403,"AI assistance is disabled for this dashboard","AI_DISABLED");const metadata=await planningMetadata(workspace.version.businessContextModelId);const used=new Set(workspace.blocks.flatMap(block=>block.kpiId?[block.kpiId]:[]));const unused={...metadata,kpis:metadata.kpis.filter(kpi=>!used.has(kpi.id))};if(!unused.kpis.length)throw new HttpError(409,"All approved KPIs are already represented in this dashboard, or none are available","NO_UNUSED_APPROVED_KPIS");let questions:string[]=[];try{questions=z.array(z.string()).parse(JSON.parse(workspace.version.businessQuestionsJson));}catch{/* Legacy questions are ignored. */}const input={name:workspace.dashboard.name,description:workspace.dashboard.description||undefined,businessObjective:workspace.version.businessObjective,targetAudience:workspace.version.targetAudience,businessQuestions:questions};const plan=makePlan(input,unused);const ai=await validatePlanWithAi({purpose:input,metrics:unused.kpis,fields:unused.fields},plan);const materialized=await materializePlan(dashboardId,plan,user,workspace.blocks.map(block=>block.id),new Set(workspace.filters.map(filter=>filter.businessFieldId)),ai.contract);const validation=await validateDashboard(dashboardId,user);return{dashboardId,...materialized,planningMode:ai.usedAi?"AI_VALIDATED":"DETERMINISTIC_FALLBACK",validationOutcome:validation.outcome,previewPath:`/workspace/dashboards/${dashboardId}/edit?step=preview`};
}
