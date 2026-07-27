export type FormattedKpiValue = {
  display: string;
  full: string;
  sizeClass: "" | "is-long" | "is-very-long";
};

export function formatKpiValue(value: unknown): FormattedKpiValue {
  if (value === null || value === undefined || value === "") return { display: "—", full: "No value", sizeClass: "" };
  const full = String(value);
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return { display: full, full, sizeClass: full.length > 14 ? "is-very-long" : full.length > 10 ? "is-long" : "" };

  const absolute = Math.abs(numeric);
  const maximumFractionDigits = absolute >= 100 ? 0 : 2;
  let display = numeric.toLocaleString("en-US", { maximumFractionDigits });
  if (absolute >= 1_000_000_000 || display.length > 12) {
    display = numeric.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
  }
  return { display, full, sizeClass: display.length > 14 ? "is-very-long" : display.length > 10 ? "is-long" : "" };
}
