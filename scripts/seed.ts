import { compare, hash } from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { businessContextModels, businessContextModelVersions, dashboardBlocks, dashboardLayoutTemplates, dashboardPublications, dashboards, dashboardVersions, kpiDefinitions, users, type Role } from "../lib/db/schema";

const definitions: Array<{ role: Role; name: string; username: string; emailKey: string; passwordKey: string; defaultEmail: string }> = [
  { role: "ADMIN", name: "System Administrator", username: "admin", emailKey: "SEED_ADMIN_EMAIL", passwordKey: "SEED_ADMIN_PASSWORD", defaultEmail: "admin@example.com" },
  { role: "DATA_SOURCE_CREATOR", name: "Data Source Creator", username: "datasource", emailKey: "SEED_DATA_SOURCE_EMAIL", passwordKey: "SEED_DATA_SOURCE_PASSWORD", defaultEmail: "datasource@example.com" },
  { role: "DASHBOARD_CREATOR", name: "Dashboard Creator", username: "dashboard", emailKey: "SEED_DASHBOARD_EMAIL", passwordKey: "SEED_DASHBOARD_PASSWORD", defaultEmail: "dashboard@example.com" },
  { role: "VIEWER", name: "Dashboard Viewer", username: "viewer", emailKey: "SEED_VIEWER_EMAIL", passwordKey: "SEED_VIEWER_PASSWORD", defaultEmail: "viewer@example.com" },
];

function temporaryPassword() {
  return `A!${randomBytes(12).toString("base64url")}9z`;
}

async function seedDashboardExamples() {
  const creator = (await db.select().from(users).where(eq(users.role, "DASHBOARD_CREATOR")).limit(1))[0];
  const admin = (await db.select().from(users).where(eq(users.role, "ADMIN")).limit(1))[0];
  const model = (await db.select().from(businessContextModels).where(eq(businessContextModels.status, "PUBLISHED")).limit(1))[0];
  if (!creator || !admin || !model) {
    console.log("Dashboard examples skipped: seed users and one published Business Context are required.");
    return;
  }
  const contextVersion = (await db.select().from(businessContextModelVersions).where(and(eq(businessContextModelVersions.modelId, model.id), eq(businessContextModelVersions.status, "PUBLISHED"))).limit(1))[0];
  const template = (await db.select().from(dashboardLayoutTemplates).where(eq(dashboardLayoutTemplates.code, "EXECUTIVE_OVERVIEW")).limit(1))[0];
  const kpi = (await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, model.id), eq(kpiDefinitions.status, "APPROVED"))).limit(1))[0] || (await db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.modelId, model.id), eq(kpiDefinitions.status, "CERTIFIED"))).limit(1))[0];
  if (!contextVersion || !template) {
    console.log("Dashboard examples skipped: published snapshot or Phase 4 layout template is unavailable.");
    return;
  }
  const examples = [
    { id: "40000000-0000-4000-8000-000000000001", versionId: "41000000-0000-4000-8000-000000000001", name: "Procurement Working Draft", dashboardStatus: "DRAFT" as const, versionStatus: "DRAFT" as const },
    { id: "40000000-0000-4000-8000-000000000002", versionId: "41000000-0000-4000-8000-000000000002", name: "Operations Review Dashboard", dashboardStatus: "IN_REVIEW" as const, versionStatus: "IN_REVIEW" as const },
    { id: "40000000-0000-4000-8000-000000000003", versionId: "41000000-0000-4000-8000-000000000003", name: "IFS Executive Overview", dashboardStatus: "PUBLISHED" as const, versionStatus: "PUBLISHED" as const },
  ];
  for (const example of examples) {
    if ((await db.select({ id: dashboards.id }).from(dashboards).where(eq(dashboards.id, example.id)).limit(1)).length) continue;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(dashboards).values({ id: example.id, name: example.name, description: "Governed Phase 4 sample using a locked published Business Context.", category: "Operations", ownerUserId: creator.id, businessOwnerUserId: admin.id, status: example.dashboardStatus, visibility: example.dashboardStatus === "PUBLISHED" ? "WORKSPACE" : "PRIVATE", aiCopilotAllowed: true, createdBy: creator.id, updatedBy: creator.id, createdAt: now, updatedAt: now });
      await tx.insert(dashboardVersions).values({ id: example.versionId, dashboardId: example.id, versionNumber: 1, businessObjective: "Give decision makers a governed view of operational performance and exceptions.", targetAudience: "Operational leaders and business owners", businessQuestionsJson: JSON.stringify(["What needs attention now?", "How is performance changing?"]), refreshExpectation: "On demand", defaultDateRange: "Last 30 days", tagsJson: JSON.stringify(["phase4", "sample"]), businessContextModelId: model.id, businessContextVersionId: contextVersion.id, dataSourceId: model.dataSourceId, layoutTemplateId: template.id, layoutJson: template.definitionJson, status: example.versionStatus, revision: 1, submittedAt: example.versionStatus !== "DRAFT" ? now : null, submittedBy: example.versionStatus !== "DRAFT" ? creator.id : null, approvedAt: example.versionStatus === "PUBLISHED" ? now : null, approvedBy: example.versionStatus === "PUBLISHED" ? admin.id : null, publishedAt: example.versionStatus === "PUBLISHED" ? now : null, publishedBy: example.versionStatus === "PUBLISHED" ? admin.id : null, createdBy: creator.id, updatedBy: creator.id, createdAt: now, updatedAt: now });
      if (kpi) await tx.insert(dashboardBlocks).values({ id: example.id.replace("40000000", "42000000"), dashboardVersionId: example.versionId, blockType: "KPI_CARD", title: kpi.name, description: kpi.description || "Approved KPI from the locked Business Context.", businessQuestion: kpi.businessQuestion, kpiId: kpi.id, kpiVersion: kpi.version, visualizationType: "NUMBER", filtersJson: "[]", visualizationConfigJson: "{}", formattingConfigJson: "{}", positionJson: JSON.stringify({ x: 0, y: 0, w: 3, h: 2 }), sortOrder: 0, createdBy: creator.id, updatedBy: creator.id, createdAt: now, updatedAt: now });
      await tx.update(dashboards).set({ currentDraftVersionId: example.versionStatus === "PUBLISHED" ? null : example.versionId, currentPublishedVersionId: example.versionStatus === "PUBLISHED" ? example.versionId : null }).where(eq(dashboards.id, example.id));
      if (example.versionStatus === "PUBLISHED") await tx.insert(dashboardPublications).values({ id: "43000000-0000-4000-8000-000000000003", dashboardId: example.id, dashboardVersionId: example.versionId, snapshotJson: JSON.stringify({ dashboard: example, contextVersionId: contextVersion.id, kpiId: kpi?.id ?? null }), visibility: "WORKSPACE", allowedRolesJson: JSON.stringify(["VIEWER", "DASHBOARD_CREATOR"]), aiCopilotAllowed: true, publishedBy: admin.id, publishedAt: now });
    });
  }
  console.log("Phase 4 dashboard examples are ready (draft, in review, published). ");
}

async function main() {
  const created: Array<{ role: Role; email: string; password: string }> = [];
  for (const definition of definitions) {
    const email = (process.env[definition.emailKey] || definition.defaultEmail).trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) continue;
    const supplied = process.env[definition.passwordKey];
    if (process.env.NODE_ENV === "production" && !supplied) throw new Error(`${definition.passwordKey} is required in production`);
    const password = supplied || temporaryPassword();
    const passwordHash = await hash(password, 12);
    if (await compare(password, passwordHash) !== true) throw new Error("Password hashing verification failed");
    const now = new Date();
    await db.insert(users).values({ id: randomUUID(), fullName: definition.name, username: definition.username, email, passwordHash, role: definition.role, status: "ACTIVE", mustChangePassword: true, createdAt: now, updatedAt: now });
    created.push({ role: definition.role, email, password });
  }
  if (!created.length) console.log("Seed skipped: all four role users already exist.");
  else {
    console.log("Created seed users. Temporary passwords are shown once; store them securely:");
    for (const item of created) console.log(`${item.role}: ${item.email} / ${item.password}`);
  }
  await seedDashboardExamples();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
}).finally(async () => pool.end());
