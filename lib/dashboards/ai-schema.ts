import { z } from "zod";

export const dashboardRecommendationSchema = z.object({
  recommendationType: z.enum(["BLOCK_CONFIGURATION", "KPI", "DIMENSION", "VISUALIZATION", "LAYOUT", "FILTER", "COVERAGE", "REDUNDANCY"]),
  summary: z.string().min(2).max(500),
  reason: z.string().min(2).max(2000),
  confidence: z.number().min(0).max(1),
  kpiId: z.string().uuid().nullable(),
  dimensionFieldId: z.string().uuid().nullable(),
  visualizationType: z.enum(["NUMBER", "LINE", "AREA", "BAR", "HORIZONTAL_BAR", "STACKED_BAR", "DONUT", "PIE", "TREEMAP", "PROGRESS", "GAUGE", "BULLET", "TABLE", "PIVOT", "FUNNEL", "EXCEPTION_LIST", "TEXT"]).nullable(),
  suggestedTitle: z.string().max(190).nullable(),
  suggestedDescription: z.string().max(2000).nullable(),
  warnings: z.array(z.string().max(500)).max(10),
  requiresConfirmation: z.literal(true),
}).strict();

export type DashboardRecommendation = z.infer<typeof dashboardRecommendationSchema>;
