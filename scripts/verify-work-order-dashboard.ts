import { and, eq } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { users } from "../lib/db/schema";
import { getDashboardWorkspace } from "../lib/dashboards/service";
import { executePublishedWidget, getPublishedDashboard } from "../lib/published-dashboards/service";

const DASHBOARD_ID = "70000000-0000-4000-8000-000000000001";
const DASHBOARD_SLUG = "work-order-management";

async function main() {
  const [admin] = await db.select().from(users).where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE"))).limit(1);
  const [viewer] = await db.select().from(users).where(and(eq(users.role, "VIEWER"), eq(users.status, "ACTIVE"))).limit(1);
  if (!admin || !viewer) throw new Error("Active ADMIN and VIEWER users are required");
  const adminUser = { id: admin.id, fullName: admin.fullName, username: admin.username, email: admin.email, role: admin.role, mustChangePassword: admin.mustChangePassword };
  const viewerUser = { id: viewer.id, fullName: viewer.fullName, username: viewer.username, email: viewer.email, role: viewer.role, mustChangePassword: viewer.mustChangePassword };

  const workspace = await getDashboardWorkspace(DASHBOARD_ID, adminUser);
  const published = await getPublishedDashboard(DASHBOARD_SLUG, viewerUser);
  const widgetResults = [];
  for (const block of published.blocks) {
    const result = await executePublishedWidget(DASHBOARD_SLUG, block.id, [], viewerUser);
    widgetResults.push({ blockId: block.id, title: block.title, rowCount: result.rowCount ?? 0, source: result.source });
  }

  const filterResults = [];
  for (const filter of published.filters) {
    const sample = filter.allowedValues[0];
    if (sample === undefined || (typeof sample !== "string" && typeof sample !== "number" && typeof sample !== "boolean" && sample !== null)) continue;
    const result = await executePublishedWidget(DASHBOARD_SLUG, published.blocks[0].id, [{ filterId: filter.id, values: [sample] }], viewerUser);
    filterResults.push({ filterId: filter.id, name: filter.name, sample, rowCount: result.rowCount });
  }

  console.log(JSON.stringify({
    editor: { dashboard: workspace.dashboard.name, versionStatus: workspace.version.status, blockCount: workspace.blocks.length, filterCount: workspace.filters.length },
    published: { dashboard: published.dashboard.name, slug: published.dashboard.slug, blockCount: published.blocks.length, filterCount: published.filters.length },
    widgets: widgetResults,
    filters: filterResults,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
