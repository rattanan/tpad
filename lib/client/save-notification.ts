const createRoutes = [
  /^\/api\/data-sources$/,
  /^\/api\/admin\/users$/,
  /^\/api\/admin\/data-source-access$/,
  /^\/api\/business-context-models$/,
  /^\/api\/business-context-models\/[^/]+\/(business-objects|relationships)$/,
  /^\/api\/business-context-models\/[^/]+\/(generate-kpis|fields\/remove)$/,
  /^\/api\/business-fields\/[^/]+\/describe$/,
  /^\/api\/business-glossary$/,
  /^\/api\/kpis$/,
  /^\/api\/dashboards$/,
  /^\/api\/dashboards\/[^/]+\/(blocks|filters)$/,
  /^\/api\/auth\/change-password$/,
];

export function shouldShowSaveSuccess(pathname: string, method: string) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "PATCH" || normalizedMethod === "PUT") return pathname.startsWith("/api/");
  return normalizedMethod === "POST" && createRoutes.some((pattern) => pattern.test(pathname));
}
