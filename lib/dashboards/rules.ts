export type DashboardFinding = { category: "CONFIGURATION" | "BUSINESS_CONTEXT" | "KPI" | "QUERY" | "QUALITY" | "ACCESS"; severity: "INFO" | "WARNING" | "ERROR"; code: string; message: string; suggestedCorrection?: string; dashboardBlockId?: string };

const transitions: Record<string, ReadonlySet<string>> = {
  DRAFT: new Set(["READY_FOR_REVIEW", "ARCHIVED"]),
  CHANGES_REQUESTED: new Set(["DRAFT", "READY_FOR_REVIEW", "ARCHIVED"]),
  READY_FOR_REVIEW: new Set(["IN_REVIEW", "CHANGES_REQUESTED"]),
  IN_REVIEW: new Set(["APPROVED", "CHANGES_REQUESTED"]),
  APPROVED: new Set(["PUBLISHED", "CHANGES_REQUESTED"]),
  PUBLISHED: new Set(["UNPUBLISHED"]),
  UNPUBLISHED: new Set(["PUBLISHED", "ARCHIVED"]),
  ARCHIVED: new Set(),
};

export function canTransitionDashboard(from: string, to: string) { return transitions[from]?.has(to) ?? false; }
export function assertSafeDashboardSql(sql: string) {
  const normalized = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ").trim();
  if (!/^(WITH\b[\s\S]*?\bSELECT\b|SELECT\b)/i.test(normalized)) throw new Error("Only SELECT statements are permitted");
  if (/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|CALL|BEGIN|DECLARE|COMMIT|ROLLBACK)\b/i.test(normalized)) throw new Error("DDL, DML, and procedural SQL are blocked");
  if (/;\s*\S/.test(normalized) || /\/\*|--/.test(sql)) throw new Error("Multiple statements and SQL comments are blocked");
  if (!/FETCH\s+FIRST\s+:?\w+\s+ROWS\s+ONLY|ROWNUM\s*<=\s*:?\w+/i.test(normalized)) throw new Error("Dashboard queries require a parameterized row limit");
  return normalized;
}

export function validateVisualization(input: { blockType: string; visualizationType: string; dimensionType?: string; categoryLimit?: number; hasTarget?: boolean; kpiMeasureType?: string }) {
  const findings: DashboardFinding[] = [];
  const timeBased = input.dimensionType === "DATE" || input.dimensionType === "DATETIME";
  if (["LINE", "AREA"].includes(input.visualizationType) && !timeBased) findings.push({ category: "CONFIGURATION", severity: "ERROR", code: "ORDERED_DIMENSION_REQUIRED", message: "Line and area charts require an ordered date dimension.", suggestedCorrection: "Select a date field or use a comparison chart." });
  if (input.visualizationType === "PIE" && (input.categoryLimit ?? 9) > 8) findings.push({ category: "QUALITY", severity: "WARNING", code: "TOO_MANY_PIE_CATEGORIES", message: "Pie charts should contain no more than eight categories.", suggestedCorrection: "Use a bar or donut chart with Top N." });
  if (input.visualizationType === "GAUGE" && !input.hasTarget) findings.push({ category: "CONFIGURATION", severity: "ERROR", code: "GAUGE_TARGET_REQUIRED", message: "A gauge requires a target or known range.", suggestedCorrection: "Configure a KPI target or use a KPI card." });
  if (input.visualizationType === "FUNNEL" && input.blockType !== "FUNNEL") findings.push({ category: "CONFIGURATION", severity: "ERROR", code: "FUNNEL_STAGE_REQUIRED", message: "Funnel visualization is available only for an ordered funnel block." });
  if (input.kpiMeasureType === "RATIO" && input.visualizationType === "STACKED_BAR") findings.push({ category: "KPI", severity: "WARNING", code: "RATIO_STACK_WARNING", message: "Stacking ratio KPIs can imply invalid addition." });
  return findings;
}

export function defaultVisualization(blockType: string, hasDateDimension = false) {
  if (blockType === "KPI_CARD") return "NUMBER";
  if (blockType === "TREND_CHART") return hasDateDimension ? "LINE" : "AREA";
  if (blockType === "COMPARISON_CHART") return "BAR";
  if (blockType === "DISTRIBUTION_CHART") return "DONUT";
  if (blockType === "PROGRESS_STATUS") return "PROGRESS";
  if (blockType === "FUNNEL") return "FUNNEL";
  if (blockType === "EXCEPTION_LIST") return "EXCEPTION_LIST";
  if (blockType === "TEXT_INSIGHT") return "TEXT";
  if (blockType === "PIVOT_TABLE") return "PIVOT";
  return "TABLE";
}
