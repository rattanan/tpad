import { z } from "zod";

const objectSuggestionSchema = z.object({ objects: z.array(z.object({
  tableId: z.string().uuid(), businessName: z.string().trim().min(2).max(255), description: z.string().trim().min(2).max(1000),
  recordGrain: z.string().trim().min(3).max(500).optional(), objectType: z.enum(["TRANSACTION", "MASTER_DATA", "REFERENCE_DATA", "SNAPSHOT", "AGGREGATE", "BRIDGE", "VIEW", "UNKNOWN"]).default("UNKNOWN"),
})).min(1).max(8) });

export type ObjectCandidate = { id: string; tableName: string; businessName: string | null; description: string | null; objectType: "TABLE" | "VIEW"; estimatedRowCount: number | null };
export type MeasureColumnCandidate = { columnName: string; dataType: string; isPrimaryKey: boolean; isForeignKey: boolean; sensitivityType: string };
type RawObjectSuggestion = Record<string, unknown>;
const allowedObjectTypes = new Set(["TRANSACTION", "MASTER_DATA", "REFERENCE_DATA", "SNAPSHOT", "AGGREGATE", "BRIDGE", "VIEW", "UNKNOWN"]);
const toBusinessName = (value: string) => value.replace(/_TAB$/i, "").split("_").filter(Boolean).map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
const numericType = /NUMBER|NUMERIC|DECIMAL|INTEGER|INT|FLOAT|DOUBLE|REAL|BINARY_FLOAT|BINARY_DOUBLE/i;
const measureName = /(^|_)(AMOUNT|AMT|QUANTITY|QTY|COST|PRICE|VALUE|TOTAL|BALANCE|HOUR|HOURS|HRS|DURATION|RATE|PERCENT|PCT|COUNT|WEIGHT|VOLUME|DISTANCE|MARGIN|REVENUE|EXPENSE|CAPACITY|UTILIZATION|SCORE|DAYS|MINUTES|SECONDS)(_|$)/i;
const identifierName = /(^|_)(ID|KEY|CODE|NO|NUM|NUMBER|SEQ|SEQUENCE|VERSION|REVISION|LINE_NO|ROW_NO|SORT_ORDER|POSITION|LEVEL|FLAG|STATUS|STATE)$/i;
const masterOnlyObjectName = /(^|_)(MASTER|LOOKUP|LOV|REFERENCE|REF|TYPE|CATEGORY|CLASS|STATUS|STATE|CONFIG|SETTING)(_(TAB|VIEW))?$/i;

export function findMeasureColumns(columns: MeasureColumnCandidate[]) {
  return columns.filter((column) => numericType.test(column.dataType)
    && !column.isPrimaryKey
    && !column.isForeignKey
    && column.sensitivityType === "NONE"
    && measureName.test(column.columnName)
    && !identifierName.test(column.columnName));
}

export function isLikelyMasterOnlyObject(tableName: string) {
  return masterOnlyObjectName.test(tableName);
}

export function normalizeObjectSuggestions(input: unknown, candidates: ObjectCandidate[]) {
  const root = input && typeof input === "object" ? input as RawObjectSuggestion : {};
  const rawItems = Array.isArray(input) ? input : [root.objects, root.businessObjects, root.business_objects, root.suggestions].find(Array.isArray) ?? [];
  const byId = new Map(candidates.map((table) => [table.id, table]));
  const byName = new Map(candidates.flatMap((table) => [[table.tableName.toUpperCase(), table], [table.businessName?.toUpperCase() ?? "", table]]).filter(([name]) => Boolean(name)) as Array<[string, ObjectCandidate]>);
  const seenTableIds = new Set<string>();
  const objects = (rawItems as unknown[]).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as RawObjectSuggestion;
    const rawId = String(raw.tableId ?? raw.table_id ?? raw.physicalTableId ?? raw.id ?? "");
    const rawTableName = String(raw.tableName ?? raw.table_name ?? raw.technicalName ?? "").toUpperCase();
    const table = byId.get(rawId) ?? byName.get(rawTableName);
    if (!table || seenTableIds.has(table.id)) return [];
    seenTableIds.add(table.id);
    const rawType = String(raw.objectType ?? raw.object_type ?? raw.type ?? "UNKNOWN").toUpperCase();
    const objectType = rawType === "TABLE" ? "UNKNOWN" : allowedObjectTypes.has(rawType) ? rawType : table.objectType === "VIEW" ? "VIEW" : "UNKNOWN";
    const name = String(raw.businessName ?? raw.business_name ?? raw.name ?? table.businessName ?? toBusinessName(table.tableName)).trim();
    const generatedDescription = String(raw.description ?? raw.businessDescription ?? raw.business_description ?? table.description ?? `${name} contains records relevant to this Business Context.`).trim();
    const rawGrain = raw.recordGrain ?? raw.record_grain ?? raw.grain;
    return [{ tableId: table.id, businessName: name || toBusinessName(table.tableName), description: generatedDescription || `${name} business records.`, recordGrain: typeof rawGrain === "string" && rawGrain.trim().length >= 3 ? rawGrain.trim() : undefined, objectType }];
  }).slice(0, 8);
  return objectSuggestionSchema.parse({ objects });
}
