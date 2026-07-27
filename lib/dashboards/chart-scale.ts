export function createYAxisScale(values: number[], tickCount = 5) {
  const finiteValues = values.filter(Number.isFinite);
  const rawMinimum = finiteValues.length ? Math.min(...finiteValues) : 0;
  const rawMaximum = finiteValues.length ? Math.max(...finiteValues) : 0;
  const minimum = Math.min(0, rawMinimum);
  const maximum = rawMinimum === 0 && rawMaximum === 0 ? 1 : Math.max(0, rawMaximum);
  const range = maximum - minimum || 1;
  const count = Math.max(2, tickCount);

  return {
    minimum,
    maximum,
    range,
    ticks: Array.from(
      { length: count },
      (_, index) => maximum - (range * index) / (count - 1),
    ),
  };
}
