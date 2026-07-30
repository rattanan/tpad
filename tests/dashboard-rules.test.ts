import { describe, expect, it } from "vitest";
import { assertSafeDashboardSql, canTransitionDashboard, defaultVisualization, validateVisualization } from "../lib/dashboards/rules";
import { dashboardRecommendationSchema } from "../lib/dashboards/ai-schema";
import { blockCreateSchema, blockReorderSchema, dashboardCreateSchema, queryPlanSchema } from "../lib/dashboards/validation";
import { hasPermission } from "../lib/auth/permissions";

const id = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
describe("Phase 4 dashboard governance", () => {
  it("maps existing roles to builder, reviewer, publisher, and viewer capabilities", () => {
    expect(hasPermission("DASHBOARD_CREATOR", "EDIT_DASHBOARD")).toBe(true);
    expect(hasPermission("DASHBOARD_CREATOR", "DELETE_DASHBOARD")).toBe(true);
    expect(hasPermission("DASHBOARD_CREATOR", "PUBLISH_DASHBOARD")).toBe(false);
    expect(hasPermission("ADMIN", "REVIEW_DASHBOARD")).toBe(true);
    expect(hasPermission("ADMIN", "PUBLISH_DASHBOARD")).toBe(true);
    expect(hasPermission("VIEWER", "EDIT_DASHBOARD")).toBe(false);
    expect(hasPermission("VIEWER", "DELETE_DASHBOARD")).toBe(false);
  });
  it("enforces the dashboard lifecycle", () => {
    expect(canTransitionDashboard("DRAFT", "READY_FOR_REVIEW")).toBe(true);
    expect(canTransitionDashboard("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransitionDashboard("IN_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionDashboard("PUBLISHED", "DRAFT")).toBe(false);
  });
  it("accepts only read-only, limited dashboard SQL", () => {
    expect(assertSafeDashboardSql("SELECT COUNT(*) FROM X FETCH FIRST :dashboardRowLimit ROWS ONLY")).toMatch(/^SELECT/);
    for (const sql of ["DELETE FROM X", "SELECT * FROM X", "SELECT * FROM X; DROP TABLE X", "SELECT /* bypass */ * FROM X FETCH FIRST :limit ROWS ONLY"]) expect(() => assertSafeDashboardSql(sql)).toThrow();
  });
  it("rejects unsuitable visualization combinations deterministically", () => {
    expect(validateVisualization({ blockType: "TREND_CHART", visualizationType: "LINE", dimensionType: "TEXT" }).map((item) => item.code)).toContain("ORDERED_DIMENSION_REQUIRED");
    expect(validateVisualization({ blockType: "PROGRESS_STATUS", visualizationType: "GAUGE", hasTarget: false }).map((item) => item.code)).toContain("GAUGE_TARGET_REQUIRED");
    expect(validateVisualization({ blockType: "DISTRIBUTION_CHART", visualizationType: "PIE", categoryLimit: 12 }).map((item) => item.code)).toContain("TOO_MANY_PIE_CATEGORIES");
    expect(defaultVisualization("KPI_CARD")).toBe("NUMBER");
  });
  it("validates structured dashboard creation and block inputs", () => {
    expect(dashboardCreateSchema.safeParse({ name: "Fleet Readiness", category: "Operations", businessObjective: "Monitor fleet readiness safely", targetAudience: "Operations", businessQuestions: ["How many aircraft are serviceable?"], refreshExpectation: "Hourly", defaultDateRange: "Last 30 days", tags: [], businessContextModelId: id, businessContextVersionId: id, layoutTemplateId: id }).success).toBe(true);
    expect(blockCreateSchema.safeParse({ blockType: "KPI_CARD", title: "Readiness", visualizationType: "NUMBER", filters: [], visualizationConfig: {}, formattingConfig: {}, position: { x: 0, y: 0, w: 3, h: 2 }, isHidden: false, isLocked: false, kpiId: id }).success).toBe(true);
  });
  it("requires two distinct blocks and a revision for layout reordering", () => {
    expect(blockReorderSchema.safeParse({ sourceBlockId: id, targetBlockId: secondId, expectedRevision: 2 }).success).toBe(true);
    expect(blockReorderSchema.safeParse({ sourceBlockId: id, targetBlockId: id, expectedRevision: 2 }).success).toBe(false);
  });
  it("validates semantic query plans and bounded preview limits", () => {
    const plan = { businessContextVersionId: id, dataSourceId: id, measure: { kpiId: id, kpiVersion: 1 }, dimensions: [], filters: [], sort: [], limit: 100, relationshipPathIds: [] };
    expect(queryPlanSchema.parse(plan).limit).toBe(100);
    expect(queryPlanSchema.safeParse({ ...plan, limit: 501 }).success).toBe(false);
  });
  it("requires schema-valid, confirmable AI recommendations", () => {
    const recommendation = { recommendationType: "BLOCK_CONFIGURATION", summary: "Show readiness as a KPI card", reason: "The objective asks for current readiness.", confidence: 0.9, kpiId: id, dimensionFieldId: null, visualizationType: "NUMBER", suggestedTitle: "Fleet Readiness", suggestedDescription: "Current certified readiness rate.", warnings: [], requiresConfirmation: true };
    expect(dashboardRecommendationSchema.parse(recommendation).requiresConfirmation).toBe(true);
    expect(dashboardRecommendationSchema.safeParse({ ...recommendation, requiresConfirmation: false }).success).toBe(false);
    expect(dashboardRecommendationSchema.safeParse({ ...recommendation, kpiId: "invented" }).success).toBe(false);
  });
});
