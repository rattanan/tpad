import { z } from "zod";

export const portalViewSchema = z.enum(["all", "favorites", "recent"]).default("all");
export const portalSortSchema = z.enum(["featured", "recent", "name", "popular"]).default("featured");
export const runtimeFilterValueSchema = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
export const runtimeFiltersSchema = z.array(z.object({ filterId: z.string().uuid(), values: z.array(runtimeFilterValueSchema).max(100) }).strict()).max(20);
export const widgetRequestSchema = z.object({ filters: runtimeFiltersSchema.default([]) }).strict();
export const copilotRequestSchema = z.object({
  dashboardSlug: z.string().trim().min(1).max(190),
  conversationId: z.string().uuid().optional(),
  question: z.string().trim().min(2).max(2000).optional(),
  requestType: z.enum(["CHAT", "EXECUTIVE_SUMMARY"]).default("CHAT"),
  widgetId: z.string().uuid().optional(),
  filters: runtimeFiltersSchema.default([]),
}).strict().refine((value) => value.requestType === "EXECUTIVE_SUMMARY" || Boolean(value.question), { message: "Question is required", path: ["question"] });

export function isMutatingAiRequest(question: string) {
  return /\b(edit|change|update|delete|remove|create|add|publish|unpublish|approve|reject|write|insert|drop|alter)\b/i.test(question)
    || /(แก้ไข|เปลี่ยน|ลบ|สร้าง|เพิ่ม|เผยแพร่|อนุมัติ|ไม่อนุมัติ|เขียนข้อมูล)/u.test(question);
}
