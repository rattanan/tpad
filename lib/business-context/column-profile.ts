export type ColumnProfile = {
  sampleSize: number;
  totalRowCount?: number;
  nonNullCount: number;
  nonNullRatio?: number;
  nullRatio: number;
  distinctCount: number;
  distinctRatio?: number;
  numericCount: number;
  zeroCount: number;
  zeroRatio?: number;
  blankCount?: number;
  blankRatio?: number;
  dominantValueRatio?: number;
  profileMode?: "EXACT" | "SAMPLED_ESTIMATE";
  lastProfiledAt?: string;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  standardDeviation: number | null;
  sampleValues: string[];
};

export type ProfiledBusinessField = {
  businessName: string;
  physicalColumnName: string;
  businessType: string;
  fieldRole: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
};

const technicalName = /(^|_)(OBJID|OBJVERSION|ROWKEY|ROWVERSION|CREATED_BY|CREATED_AT|UPDATED_BY|UPDATED_AT|ETL_|LOAD_|HASH|CHECKSUM)(_|$)/i;
const numericTypes = new Set(["NUMBER", "CURRENCY", "PERCENTAGE", "DURATION", "QUANTITY"]);

function displayValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") { try { return JSON.stringify(value).slice(0, 120); } catch { return String(value).slice(0, 120); } }
  return String(value).slice(0, 120);
}

export function summarizeColumnProfile(values: unknown[], numeric: boolean): ColumnProfile {
  const present = values.filter((value) => value !== null && value !== undefined);
  const serialized = present.map(displayValue);
  const distinct = [...new Set(serialized)];
  const frequencies = new Map<string, number>();
  for (const value of serialized) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  const numbers = numeric ? present.map((value) => Number(value)).filter(Number.isFinite) : [];
  const mean = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
  const variance = mean === null ? null : numbers.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / numbers.length;
  return {
    sampleSize: values.length,
    nonNullCount: present.length,
    nonNullRatio: values.length ? present.length / values.length : 0,
    nullRatio: values.length ? (values.length - present.length) / values.length : 1,
    distinctCount: distinct.length,
    distinctRatio: present.length ? distinct.length / present.length : 0,
    numericCount: numbers.length,
    zeroCount: numbers.filter((value) => value === 0).length,
    zeroRatio: numbers.length ? numbers.filter((value) => value === 0).length / numbers.length : 0,
    blankCount: serialized.filter((value) => !value.trim()).length,
    blankRatio: present.length ? serialized.filter((value) => !value.trim()).length / present.length : 0,
    dominantValueRatio: present.length ? Math.max(0, ...frequencies.values()) / present.length : 0,
    profileMode: "SAMPLED_ESTIMATE",
    minimum: numbers.length ? Math.min(...numbers) : null,
    maximum: numbers.length ? Math.max(...numbers) : null,
    mean,
    standardDeviation: variance === null ? null : Math.sqrt(variance),
    sampleValues: distinct.slice(0, 5),
  };
}

export function classifyBusinessField(field: ProfiledBusinessField) {
  if (field.fieldRole === "TECHNICAL_FIELD" || technicalName.test(field.physicalColumnName)) return "technical_metadata" as const;
  if (field.fieldRole === "IDENTIFIER" || field.isPrimaryKey || field.isForeignKey || field.businessType === "IDENTIFIER") return "identifier" as const;
  if (field.fieldRole === "STATUS_DIMENSION" || field.businessType === "STATUS") return "status_dimension" as const;
  if (field.fieldRole === "DATE_DIMENSION" || ["DATE", "DATETIME"].includes(field.businessType)) return "date_dimension" as const;
  if (field.businessType === "CURRENCY") return "monetary_measure" as const;
  if (field.businessType === "DURATION") return "duration_measure" as const;
  if (field.fieldRole === "MEASURE" && numericTypes.has(field.businessType)) return "numeric_measure" as const;
  return "categorical_dimension" as const;
}

export function profileExclusionReasons(field: ProfiledBusinessField, profile: ColumnProfile) {
  const reasons: string[] = [];
  const classification = classifyBusinessField(field);
  if (classification === "technical_metadata") reasons.push("technical metadata");
  if (profile.nonNullCount === 0) reasons.push("all sampled values are null");
  const maxNullRatio=Number(process.env.BUSINESS_CONTEXT_MAX_NULL_RATIO??.95);const maxZeroRatio=Number(process.env.BUSINESS_CONTEXT_MAX_ZERO_RATIO??.95);const maxBlankRatio=Number(process.env.BUSINESS_CONTEXT_MAX_BLANK_RATIO??.95);
  if (profile.nullRatio >= maxNullRatio) reasons.push(`null ratio is at least ${Math.round(maxNullRatio*100)}%`);
  if (profile.nonNullCount > 0 && profile.distinctCount <= 1) reasons.push("only one distinct sampled value");
  if (["numeric_measure", "monetary_measure", "duration_measure"].includes(classification) && (profile.zeroRatio??(profile.numericCount?profile.zeroCount/profile.numericCount:0)) >= maxZeroRatio) reasons.push(`numeric values are at least ${Math.round(maxZeroRatio*100)}% zero`);
  if ((profile.blankRatio??0)>=maxBlankRatio) reasons.push(`text values are at least ${Math.round(maxBlankRatio*100)}% blank`);
  if (["numeric_measure", "monetary_measure", "duration_measure"].includes(classification) && profile.numericCount > 1 && profile.standardDeviation === 0) reasons.push("standard deviation is zero");
  return [...new Set(reasons)];
}
