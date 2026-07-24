const sensitive = /password|token|secret|api.?key|connection.?string/i;
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? "[REDACTED]" : maskSensitive(item)]));
  return value;
}
