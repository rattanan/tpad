export type KpiFieldCandidate = {
  id: string;
  businessName: string;
  businessType: string;
  fieldRole: string;
  aggregationRule: string;
  unit: string | null;
};

type RawSuggestion = Record<string, unknown>;
type Aggregation = "SUM" | "AVERAGE" | "COUNT" | "COUNT_DISTINCT" | "MINIMUM" | "MAXIMUM";
type MeasureType = "ADDITIVE" | "SEMI_ADDITIVE" | "NON_ADDITIVE" | "RATIO" | "COUNT";
const aggregations = new Map<string, Aggregation>([
  ["SUM", "SUM"], ["TOTAL", "SUM"], ["AVERAGE", "AVERAGE"], ["AVG", "AVERAGE"], ["MEAN", "AVERAGE"],
  ["COUNT", "COUNT"], ["COUNT_DISTINCT", "COUNT_DISTINCT"], ["DISTINCT_COUNT", "COUNT_DISTINCT"],
  ["COUNTDISTINCT", "COUNT_DISTINCT"], ["MIN", "MINIMUM"], ["MINIMUM", "MINIMUM"], ["MAX", "MAXIMUM"], ["MAXIMUM", "MAXIMUM"],
]);
const measureTypes = new Map<string, MeasureType>([
  ["ADDITIVE", "ADDITIVE"], ["SUM", "ADDITIVE"], ["SEMI_ADDITIVE", "SEMI_ADDITIVE"], ["SEMIADDITIVE", "SEMI_ADDITIVE"],
  ["NON_ADDITIVE", "NON_ADDITIVE"], ["NONADDITIVE", "NON_ADDITIVE"], ["RATIO", "RATIO"], ["COUNT", "COUNT"],
]);

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const safeCode = (value: string) => {
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "KPI";
  return /^[A-Z]/.test(code) ? code : `KPI_${code}`.slice(0, 80);
};
const enumKey = (value: unknown) => text(value).toUpperCase().replace(/[\s-]+/g, "_");
const optional = (value: unknown, max: number) => text(value).slice(0, max) || undefined;

export function normalizeKpiSuggestions(input: unknown, fields: KpiFieldCandidate[]) {
  const root = input && typeof input === "object" ? input as RawSuggestion : {};
  const rawItems = Array.isArray(input) ? input : [root.kpis, root.draftKpis, root.draft_kpis, root.metrics, root.suggestions].find(Array.isArray) ?? [];
  const allowed = new Map(fields.map((field) => [field.id, field]));
  const kpis = (rawItems as unknown[]).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as RawSuggestion;
    const fieldId = text(raw.fieldId ?? raw.field_id ?? raw.businessFieldId ?? raw.business_field_id ?? raw.sourceFieldId);
    const field = allowed.get(fieldId);
    if (!field) return [];
    const countOnly = field.fieldRole === "IDENTIFIER" || field.businessType === "IDENTIFIER";
    const aggregation = countOnly ? "COUNT_DISTINCT" : aggregations.get(enumKey(raw.aggregation ?? raw.aggregationFunction ?? raw.function)) ?? (aggregations.get(enumKey(field.aggregationRule)) || "SUM");
    const name = (text(raw.name ?? raw.kpiName ?? raw.kpi_name ?? raw.title) || `${aggregation === "COUNT_DISTINCT" ? "Count of" : "Total"} ${field.businessName}`).slice(0, 255);
    const description = (text(raw.description ?? raw.definition ?? raw.businessDefinition ?? raw.business_definition) || `${name} calculated from the governed ${field.businessName} field.`).slice(0, 1000);
    const rawMeasureType = measureTypes.get(enumKey(raw.measureType ?? raw.measure_type));
    const rawDenominatorId = text(raw.denominatorFieldId ?? raw.denominator_field_id);
    const denominatorFieldId = allowed.has(rawDenominatorId) && rawDenominatorId !== fieldId ? rawDenominatorId : undefined;
    const denominatorAggregation = denominatorFieldId ? aggregations.get(enumKey(raw.denominatorAggregation ?? raw.denominator_aggregation)) ?? "SUM" : undefined;
    const measureType = denominatorFieldId ? "RATIO" : aggregation.startsWith("COUNT") ? "COUNT" : rawMeasureType ?? (aggregation === "SUM" ? "ADDITIVE" : "NON_ADDITIVE");
    const stringList = (value: unknown, max: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, max) : [];
    return [{
      code: safeCode(text(raw.code ?? raw.kpiCode ?? raw.kpi_code) || `${aggregation}_${field.businessName}`),
      name,
      description: description.length >= 10 ? description : `${name} from governed business data.`,
      businessObjective: optional(raw.businessObjective ?? raw.business_objective ?? raw.objective, 1000),
      businessQuestion: optional(raw.businessQuestion ?? raw.business_question ?? raw.question, 1000),
      fieldId,
      aggregation,
      denominatorFieldId,
      denominatorAggregation,
      measureType,
      unit: optional(raw.unit, 80) ?? field.unit ?? undefined,
      recommendedVisualization: optional(raw.recommendedVisualization ?? raw.recommended_visualization ?? raw.visualization, 80),
      usefulDimensionFieldIds: stringList(raw.usefulDimensionFieldIds ?? raw.useful_dimension_field_ids ?? raw.dimensionFieldIds, 8),
      confidenceScore: Math.min(100, Math.max(0, Number(raw.confidenceScore ?? raw.confidence_score ?? 70) || 70)),
      evidence: stringList(raw.evidence, 8).map((item) => item.slice(0, 300)),
      warnings: stringList(raw.warnings ?? raw.limitations, 8).map((item) => item.slice(0, 300)),
    }];
  }).slice(0, 8);
  return { kpis };
}
