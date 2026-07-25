import { z } from "zod";

export const filterOperatorValues = ["EQ", "NE", "IN", "NOT_IN", "GT", "GTE", "LT", "LTE", "BETWEEN", "IS_NULL", "IS_NOT_NULL"] as const;
export type FormulaFilter = { businessFieldId: string; operator: (typeof filterOperatorValues)[number]; values?: Array<string | number | boolean | null> };

export type FormulaNode =
  | { type: "field"; businessFieldId: string }
  | { type: "literal"; value: string | number | boolean | null }
  | { type: "arithmetic"; operator: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE"; left: FormulaNode; right: FormulaNode }
  | { type: "aggregate"; function: "SUM" | "AVERAGE" | "COUNT" | "COUNT_DISTINCT" | "MINIMUM" | "MAXIMUM"; expression: FormulaNode; filters?: FormulaFilter[] }
  | { type: "ratio" | "percentage"; numerator: FormulaNode; denominator: FormulaNode }
  | { type: "conditional"; condition: { left: FormulaNode; operator: "EQ" | "NE" | "GT" | "GTE" | "LT" | "LTE"; right: FormulaNode }; whenTrue: FormulaNode; whenFalse: FormulaNode }
  | { type: "date_difference"; unit: "DAY" | "WEEK" | "MONTH" | "YEAR"; start: FormulaNode; end: FormulaNode }
  | { type: "period"; function: "ROLLING" | "MONTH_TO_DATE" | "YEAR_TO_DATE" | "PREVIOUS_PERIOD"; expression: FormulaNode; dateFieldId: string; periods?: number; unit?: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR" }
  | { type: "growth_rate" | "variance"; current: FormulaNode; comparison: FormulaNode }
  | { type: "custom"; function: string; arguments: FormulaNode[]; config?: Record<string, string | number | boolean | null> };

const scalarSchema = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
export const formulaFilterSchema: z.ZodType<FormulaFilter> = z.object({ businessFieldId: z.string().uuid(), operator: z.enum(filterOperatorValues), values: z.array(scalarSchema).max(100).optional() }).strict();

export const formulaNodeSchema: z.ZodType<FormulaNode> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("field"), businessFieldId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("literal"), value: scalarSchema }).strict(),
  z.object({ type: z.literal("arithmetic"), operator: z.enum(["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE"]), left: formulaNodeSchema, right: formulaNodeSchema }).strict(),
  z.object({ type: z.literal("aggregate"), function: z.enum(["SUM", "AVERAGE", "COUNT", "COUNT_DISTINCT", "MINIMUM", "MAXIMUM"]), expression: formulaNodeSchema, filters: z.array(formulaFilterSchema).max(30).optional() }).strict(),
  z.object({ type: z.literal("ratio"), numerator: formulaNodeSchema, denominator: formulaNodeSchema }).strict(),
  z.object({ type: z.literal("percentage"), numerator: formulaNodeSchema, denominator: formulaNodeSchema }).strict(),
  z.object({ type: z.literal("conditional"), condition: z.object({ left: formulaNodeSchema, operator: z.enum(["EQ", "NE", "GT", "GTE", "LT", "LTE"]), right: formulaNodeSchema }).strict(), whenTrue: formulaNodeSchema, whenFalse: formulaNodeSchema }).strict(),
  z.object({ type: z.literal("date_difference"), unit: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]), start: formulaNodeSchema, end: formulaNodeSchema }).strict(),
  z.object({ type: z.literal("period"), function: z.enum(["ROLLING", "MONTH_TO_DATE", "YEAR_TO_DATE", "PREVIOUS_PERIOD"]), expression: formulaNodeSchema, dateFieldId: z.string().uuid(), periods: z.number().int().min(1).max(120).optional(), unit: z.enum(["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]).optional() }).strict(),
  z.object({ type: z.literal("growth_rate"), current: formulaNodeSchema, comparison: formulaNodeSchema }).strict(),
  z.object({ type: z.literal("variance"), current: formulaNodeSchema, comparison: formulaNodeSchema }).strict(),
  z.object({ type: z.literal("custom"), function: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/).max(80), arguments: z.array(formulaNodeSchema).min(1).max(20), config: z.record(z.string(), scalarSchema).optional() }).strict(),
]));

export function collectFormulaFieldIds(node: FormulaNode, result = new Set<string>()): Set<string> {
  if (node.type === "field") result.add(node.businessFieldId);
  else if (node.type === "arithmetic") { collectFormulaFieldIds(node.left, result); collectFormulaFieldIds(node.right, result); }
  else if (node.type === "aggregate") { collectFormulaFieldIds(node.expression, result); node.filters?.forEach((filter) => result.add(filter.businessFieldId)); }
  else if (node.type === "ratio" || node.type === "percentage") { collectFormulaFieldIds(node.numerator, result); collectFormulaFieldIds(node.denominator, result); }
  else if (node.type === "conditional") { collectFormulaFieldIds(node.condition.left, result); collectFormulaFieldIds(node.condition.right, result); collectFormulaFieldIds(node.whenTrue, result); collectFormulaFieldIds(node.whenFalse, result); }
  else if (node.type === "date_difference") { collectFormulaFieldIds(node.start, result); collectFormulaFieldIds(node.end, result); }
  else if (node.type === "period") { result.add(node.dateFieldId); collectFormulaFieldIds(node.expression, result); }
  else if (node.type === "growth_rate" || node.type === "variance") { collectFormulaFieldIds(node.current, result); collectFormulaFieldIds(node.comparison, result); }
  else if (node.type === "custom") node.arguments.forEach((argument) => collectFormulaFieldIds(argument, result));
  return result;
}

export function formulaLabel(node: FormulaNode, fieldNames: Map<string, string>): string {
  if (node.type === "field") return fieldNames.get(node.businessFieldId) ?? "Unknown field";
  if (node.type === "literal") return node.value === null ? "NULL" : String(node.value);
  if (node.type === "arithmetic") return `(${formulaLabel(node.left, fieldNames)} ${{ ADD: "+", SUBTRACT: "−", MULTIPLY: "×", DIVIDE: "÷" }[node.operator]} ${formulaLabel(node.right, fieldNames)})`;
  if (node.type === "aggregate") return `${node.function}(${formulaLabel(node.expression, fieldNames)})`;
  if (node.type === "ratio" || node.type === "percentage") return `${node.type.toUpperCase()}(${formulaLabel(node.numerator, fieldNames)}, ${formulaLabel(node.denominator, fieldNames)})`;
  if (node.type === "conditional") return `IF ${formulaLabel(node.condition.left, fieldNames)} ${node.condition.operator} ${formulaLabel(node.condition.right, fieldNames)}`;
  if (node.type === "date_difference") return `DATE_DIFF_${node.unit}(${formulaLabel(node.start, fieldNames)}, ${formulaLabel(node.end, fieldNames)})`;
  if (node.type === "period") return `${node.function}(${formulaLabel(node.expression, fieldNames)})`;
  if (node.type === "growth_rate" || node.type === "variance") return `${node.type.toUpperCase()}(${formulaLabel(node.current, fieldNames)}, ${formulaLabel(node.comparison, fieldNames)})`;
  if (node.type === "custom") return `${node.function}(${node.arguments.map((argument) => formulaLabel(argument, fieldNames)).join(", ")})`;
  return "Formula";
}

const nonNumericTypes = new Set(["TEXT", "STATUS", "IDENTIFIER", "EMAIL", "PHONE", "URL", "BOOLEAN", "DATE", "DATETIME", "GEOGRAPHIC"]);
export function validateFormulaTypes(node: FormulaNode, fields: Map<string, { businessType: string; fieldRole?: string; approvalStatus: string }>) {
  const issues: string[] = [];
  const checkField = (id: string) => { const field = fields.get(id); if (!field) issues.push(`Field ${id} does not exist`); else if (field.approvalStatus !== "APPROVED") issues.push(`Field ${id} is not approved`); return field; };
  const visit = (item: FormulaNode) => {
    if (item.type === "field") checkField(item.businessFieldId);
    else if (item.type === "arithmetic") { visit(item.left); visit(item.right); if (item.operator === "DIVIDE" && item.right.type === "literal" && item.right.value === 0) issues.push("Division by a literal zero is not allowed"); }
    else if (item.type === "aggregate") { if (item.expression.type === "field") { const field = checkField(item.expression.businessFieldId); if (field && ["SUM", "AVERAGE"].includes(item.function) && (nonNumericTypes.has(field.businessType) || field.fieldRole === "IDENTIFIER")) issues.push(`${item.function} is invalid for ${field.businessType}`); } else visit(item.expression); item.filters?.forEach((filter) => checkField(filter.businessFieldId)); }
    else if (item.type === "ratio" || item.type === "percentage") { visit(item.numerator); visit(item.denominator); }
    else if (item.type === "conditional") { visit(item.condition.left); visit(item.condition.right); visit(item.whenTrue); visit(item.whenFalse); }
    else if (item.type === "date_difference") { visit(item.start); visit(item.end); }
    else if (item.type === "period") { const date = checkField(item.dateFieldId); if (date && !["DATE", "DATETIME"].includes(date.businessType)) issues.push("Period function requires a date field"); visit(item.expression); }
    else if (item.type === "growth_rate" || item.type === "variance") { visit(item.current); visit(item.comparison); }
    else if (item.type === "custom") item.arguments.forEach(visit);
  };
  visit(node);
  return [...new Set(issues)];
}
