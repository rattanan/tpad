export type RuleIssue = { code: string; severity: "WARNING" | "ERROR"; message: string };

export function validateBusinessFieldConfiguration(field: { businessType: string; fieldRole: string; aggregationRule: string; sensitivityClassification: string; aiUsageAllowed: boolean; visibleToDashboardCreator: boolean }): RuleIssue[] {
  const issues: RuleIssue[] = []; const notSummable = new Set(["TEXT", "STATUS", "IDENTIFIER", "EMAIL", "PHONE", "URL", "BOOLEAN", "DATE", "DATETIME"]);
  if (["SUM", "AVERAGE"].includes(field.aggregationRule) && (notSummable.has(field.businessType) || field.fieldRole === "IDENTIFIER")) issues.push({ code: "INVALID_AGGREGATION", severity: "ERROR", message: `${field.aggregationRule} is invalid for ${field.businessType}.` });
  if (field.fieldRole === "MEASURE" && field.aggregationRule === "NONE") issues.push({ code: "MEASURE_AGGREGATION_REQUIRED", severity: "ERROR", message: "Measures require an aggregation rule." });
  if (field.sensitivityClassification !== "NONE" && field.aiUsageAllowed) issues.push({ code: "SENSITIVE_AI", severity: "ERROR", message: "Sensitive fields cannot be AI-enabled by default." });
  if (field.fieldRole === "IGNORED" && field.visibleToDashboardCreator) issues.push({ code: "IGNORED_VISIBILITY", severity: "ERROR", message: "Ignored fields cannot be visible to Dashboard Creator." });
  return issues;
}

export function detectGrainConflict(objects: Array<{ id: string; recordGrain?: string | null }>, relationships: Array<{ sourceObjectId: string; targetObjectId: string; cardinality: string }>) {
  const missing = new Set(objects.filter((item) => !item.recordGrain?.trim()).map((item) => item.id));
  return relationships.filter((item) => missing.has(item.sourceObjectId) || missing.has(item.targetObjectId) || item.cardinality === "UNKNOWN").map((item) => ({ relationship: item, reason: item.cardinality === "UNKNOWN" ? "Unknown cardinality" : "Missing record grain" }));
}

export function detectMeasureDuplicationRisk(relationships: Array<{ id: string; cardinality: string }>) { return relationships.filter((item) => item.cardinality === "MANY_TO_MANY" || item.cardinality === "ONE_TO_MANY").map((item) => item.id); }

export function nextModelStatus(current: string, action: "SUBMIT" | "APPROVE" | "PUBLISH" | "CREATE_VERSION") {
  const transitions: Record<string, Partial<Record<typeof action, string>>> = { DRAFT: { SUBMIT: "READY_FOR_REVIEW" }, CHANGES_REQUESTED: { SUBMIT: "READY_FOR_REVIEW" }, READY_FOR_REVIEW: { APPROVE: "APPROVED" }, APPROVED: { PUBLISH: "PUBLISHED" }, PUBLISHED: { CREATE_VERSION: "DRAFT" } };
  return transitions[current]?.[action] ?? null;
}

export function compareVersionSnapshots(previous: Record<string, Array<{ id: string; version?: number }>>, current: Record<string, Array<{ id: string; version?: number }>>) {
  return Object.fromEntries([...new Set([...Object.keys(previous), ...Object.keys(current)])].map((key) => { const before = new Map((previous[key] ?? []).map((item) => [item.id, item])); const after = new Map((current[key] ?? []).map((item) => [item.id, item])); return [key, { added: [...after.keys()].filter((id) => !before.has(id)), removed: [...before.keys()].filter((id) => !after.has(id)), modified: [...after.keys()].filter((id) => before.has(id) && JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) }]; }));
}
