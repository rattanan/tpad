export function aiRequestTimeoutMs(raw = process.env.AI_REQUEST_TIMEOUT_MS) {
  const configured = Number(raw);
  if (!Number.isFinite(configured)) return 90_000;
  return Math.min(180_000, Math.max(30_000, Math.round(configured)));
}
