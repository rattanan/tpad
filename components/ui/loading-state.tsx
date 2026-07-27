export default function LoadingState({ label = "Loading…", compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`insight-loading ${compact ? "compact" : ""}`} role="status" aria-live="polite"><span className="insight-spinner" aria-hidden="true"/><div><strong>{label}</strong>{!compact && <small>Please wait while InsightFS prepares this view.</small>}</div></div>;
}
