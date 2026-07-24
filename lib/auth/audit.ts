import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import type { RequestMeta } from "./request";
import { maskSensitive } from "./mask";

export async function writeAudit(input: {
  actor?: { id: string; fullName: string } | null;
  action: string; category: string; targetType?: string; targetId?: string; targetName?: string;
  result?: "SUCCESS" | "FAILED"; description?: string; previousValues?: unknown; newValues?: unknown; meta: RequestMeta;
}) {
  await db.insert(auditLogs).values({
    id: randomUUID(), actorUserId: input.actor?.id, actorName: input.actor?.fullName,
    action: input.action, category: input.category, targetType: input.targetType, targetId: input.targetId, targetName: input.targetName,
    result: input.result ?? "SUCCESS", description: input.description,
    previousValues: input.previousValues === undefined ? undefined : JSON.stringify(maskSensitive(input.previousValues)),
    newValues: input.newValues === undefined ? undefined : JSON.stringify(maskSensitive(input.newValues)),
    ipAddress: input.meta.ipAddress, userAgent: input.meta.userAgent, requestId: input.meta.requestId, createdAt: new Date(),
  });
}
