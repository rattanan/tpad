export type AutoRepairFinding = {severity:string;code:string;dashboardBlockId?:string|null};

const removableBlockCodes=new Set(["PREVIEW_REQUIRED","DATASET_SHAPE_INVALID","QUERY_PLAN_INVALID","BLOCK_REQUIREMENT_FAILED","ORDERED_DIMENSION_REQUIRED","GAUGE_TARGET_REQUIRED"]);
const filterErrorCodes=new Set(["FILTER_COMPATIBILITY","FILTER_FIELD_INVALID","FILTER_BLOCK_INVALID","FILTER_DEPENDENCY_INVALID","FILTER_DEPENDENCY_CYCLE"]);

export function planGeneratedAutoRepair(findings:AutoRepairFinding[],generatedBlockIds:Iterable<string>,generatedFilterIds:Iterable<string>){
  const blocks=new Set(generatedBlockIds);const filters=[...generatedFilterIds];const errors=findings.filter(item=>item.severity==="ERROR");
  return{blockIds:[...new Set(errors.flatMap(item=>item.dashboardBlockId&&blocks.has(item.dashboardBlockId)&&removableBlockCodes.has(item.code)?[item.dashboardBlockId]:[]))],filterIds:errors.some(item=>filterErrorCodes.has(item.code))?filters:[]};
}
