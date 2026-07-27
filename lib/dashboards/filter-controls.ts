export const smartFilterControlTypes = [
  "DROPDOWN", "SEARCHABLE_DROPDOWN", "MULTI_SELECT", "SEARCHABLE_MULTI_SELECT",
  "ASYNC_SEARCHABLE_DROPDOWN", "ASYNC_SEARCHABLE_MULTI_SELECT", "CHECKBOX_GROUP",
  "RADIO_GROUP", "DATE_PICKER", "DATE_RANGE_PICKER", "RELATIVE_DATE", "NUMBER_INPUT",
  "NUMBER_RANGE", "TEXT_SEARCH", "TOGGLE", "HIERARCHICAL", "CASCADING",
] as const;

export type SmartFilterControlType = typeof smartFilterControlTypes[number];
export type SmartFilterConfiguration = {
  controlType: SmartFilterControlType;
  selectionMode: "SINGLE" | "MULTIPLE";
  placeholder: string;
  allowSelectAll: boolean;
  allowClear: boolean;
  searchable: boolean;
  searchMode: "CLIENT" | "SERVER";
  minimumSearchCharacters: number;
  pageSize: number;
  sortOrder: "ALPHABETICAL" | "VALUE_ASC" | "VALUE_DESC";
  maximumSelectedItems: number;
  dateFormat: string;
  numberFormat: string;
  relativeDatePresets: string[];
  dependsOn: string[];
  displayFieldId?: string;
  valueFieldId?: string;
  applyMode: "MANUAL" | "AUTO";
  position: number;
  reason: string;
};

export type FilterFieldMetadata = {
  businessType: string;
  fieldRole: string;
  searchable: boolean;
  businessName: string;
};

const datePresets = ["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_30_DAYS", "THIS_WEEK", "LAST_WEEK", "THIS_MONTH", "LAST_MONTH", "THIS_QUARTER", "THIS_YEAR", "CUSTOM"];

export function recommendFilterConfiguration(field: FilterFieldMetadata, allowedValueCount: number, queryType: string, position = 0): SmartFilterConfiguration {
  const multiple = queryType === "MULTI_SELECT";
  let controlType: SmartFilterControlType;
  let reason: string;
  if (["DATE", "DATETIME"].includes(field.businessType)) {
    controlType = queryType === "SINGLE_SELECT" ? "DATE_PICKER" : "RELATIVE_DATE";
    reason = "Date fields use governed date controls and common relative periods.";
  } else if (["NUMBER", "CURRENCY", "PERCENTAGE", "QUANTITY", "DURATION"].includes(field.businessType)) {
    controlType = queryType === "SINGLE_SELECT" ? "NUMBER_INPUT" : "NUMBER_RANGE";
    reason = "Numeric fields use typed numeric input instead of free text.";
  } else if (field.businessType === "BOOLEAN") {
    controlType = "TOGGLE";
    reason = "Boolean fields are most clearly represented as a toggle.";
  } else if (allowedValueCount > 0 && allowedValueCount <= 10) {
    controlType = multiple ? "CHECKBOX_GROUP" : "DROPDOWN";
    reason = "The published allowlist contains at most 10 values.";
  } else if (allowedValueCount <= 100 && allowedValueCount > 10) {
    controlType = multiple ? "SEARCHABLE_MULTI_SELECT" : "SEARCHABLE_DROPDOWN";
    reason = "The published allowlist is medium-cardinality and benefits from client-side search.";
  } else if (field.searchable || field.fieldRole === "IDENTIFIER" || allowedValueCount > 100 || allowedValueCount === 0) {
    controlType = multiple ? "ASYNC_SEARCHABLE_MULTI_SELECT" : "ASYNC_SEARCHABLE_DROPDOWN";
    reason = "Values are high-cardinality or not preloaded, so options are searched on the server.";
  } else {
    controlType = multiple ? "MULTI_SELECT" : "DROPDOWN";
    reason = "A governed categorical selector is safer than unrestricted text input.";
  }
  return {
    controlType,
    selectionMode: multiple ? "MULTIPLE" : "SINGLE",
    placeholder: `Select ${field.businessName}`,
    allowSelectAll: multiple,
    allowClear: true,
    searchable: controlType.includes("SEARCHABLE"),
    searchMode: controlType.startsWith("ASYNC_") ? "SERVER" : "CLIENT",
    minimumSearchCharacters: controlType.startsWith("ASYNC_") ? 2 : 0,
    pageSize: 30,
    sortOrder: "ALPHABETICAL",
    maximumSelectedItems: multiple ? 20 : 1,
    dateFormat: "DD/MM/YYYY",
    numberFormat: "#,##0.##",
    relativeDatePresets: datePresets,
    dependsOn: [],
    applyMode: "MANUAL",
    position,
    reason,
  };
}

export function parseSmartFilterConfiguration(value: string | null | undefined, fallback: SmartFilterConfiguration) {
  try {
    const parsed = value ? JSON.parse(value) as Partial<SmartFilterConfiguration> : {};
    return { ...fallback, ...parsed, dependsOn: Array.isArray(parsed.dependsOn) ? parsed.dependsOn : [], relativeDatePresets: Array.isArray(parsed.relativeDatePresets) ? parsed.relativeDatePresets : fallback.relativeDatePresets };
  } catch {
    return fallback;
  }
}
