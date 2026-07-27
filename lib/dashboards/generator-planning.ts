export function orderDashboardKpiCandidates<T extends { id: string }>(kpis: T[], selectedIds: string[]) {
  const byId = new Map(kpis.map((item) => [item.id, item]));
  const orderedIds = [...new Set([...selectedIds, ...kpis.map((item) => item.id)])];
  return orderedIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}
