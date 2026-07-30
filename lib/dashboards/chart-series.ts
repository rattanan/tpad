export type CategoricalChartValue = { label: string; value: number };

export function buildPieSeries(values: CategoricalChartValue[], maximumSlices = 6) {
  const limit = Math.max(2, maximumSlices);
  const sorted = values
    .filter((item) => item.label.trim() && Number.isFinite(item.value) && item.value > 0)
    .sort((left, right) => right.value - left.value);
  if (sorted.length <= limit) return sorted;
  const visible = sorted.slice(0, limit - 1);
  const otherValue = sorted.slice(limit - 1).reduce((sum, item) => sum + item.value, 0);
  return [...visible, { label: "Other", value: otherValue }];
}

export function buildFunnelSeries(values: CategoricalChartValue[], orderedStages: string[] = [], maximumStages = 8) {
  const clean = values.filter((item) => item.label.trim() && Number.isFinite(item.value) && item.value >= 0);
  const order = new Map(orderedStages.map((label, index) => [label, index]));
  return [...clean]
    .sort((left, right) => {
      const leftOrder = order.get(left.label);
      const rightOrder = order.get(right.label);
      if (leftOrder !== undefined || rightOrder !== undefined) return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
      return right.value - left.value;
    })
    .slice(0, Math.max(3, maximumStages));
}

export function deriveOrderedStages(rows: Array<Record<string, unknown>>, maximumStages = 8) {
  return buildFunnelSeries(rows.map((row) => ({
    label: String(row.DIMENSION_VALUE ?? row.dimension_value ?? "").trim(),
    value: Number(row.KPI_VALUE ?? row.kpi_value ?? 0),
  })), [], maximumStages).map((item) => item.label);
}

export function selectDistributionVisualization(distinctCount?: number) {
  if (distinctCount !== undefined && distinctCount >= 2 && distinctCount <= 5) return "PIE" as const;
  if (distinctCount !== undefined && distinctCount <= 8) return "DONUT" as const;
  return "HORIZONTAL_BAR" as const;
}
