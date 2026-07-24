import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { passwordHistory, users, type Role, type UserStatus } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import type { RequestMeta } from "@/lib/auth/request";

export type Actor = { id: string; fullName: string };
const publicColumns = { id: users.id, fullName: users.fullName, username: users.username, email: users.email, role: users.role, status: users.status, adminNotes: users.adminNotes, mustChangePassword: users.mustChangePassword, lastLoginAt: users.lastLoginAt, passwordChangedAt: users.passwordChangedAt, createdAt: users.createdAt, updatedAt: users.updatedAt, createdBy: users.createdBy, archivedAt: users.archivedAt };

export async function listUsers(params: { q?: string; role?: Role; status?: UserStatus; page: number; pageSize: number; sort: string; order: "asc" | "desc" }) {
  const filters = [];
  if (params.q) filters.push(or(like(users.fullName, `%${params.q}%`), like(users.username, `%${params.q}%`), like(users.email, `%${params.q}%`))!);
  if (params.role) filters.push(eq(users.role, params.role));
  if (params.status) filters.push(eq(users.status, params.status));
  const where = filters.length ? and(...filters) : undefined;
  const sortable = { fullName: users.fullName, email: users.email, role: users.role, status: users.status, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt } as const;
  const column = sortable[params.sort as keyof typeof sortable] ?? users.createdAt;
  const [items, totals] = await Promise.all([
    db.select(publicColumns).from(users).where(where).orderBy(params.order === "asc" ? asc(column) : desc(column)).limit(params.pageSize).offset((params.page - 1) * params.pageSize),
    db.select({ count: count() }).from(users).where(where),
  ]);
  return { items, total: totals[0]?.count ?? 0, page: params.page, pageSize: params.pageSize };
}
export async function getUser(id: string) { return (await db.select(publicColumns).from(users).where(eq(users.id, id)).limit(1))[0] ?? null; }

export async function createUser(input: { fullName: string; username: string; email: string; role: Role; status: UserStatus; password: string; mustChangePassword: boolean; adminNotes?: string }, actor: Actor, meta: RequestMeta) {
  const errors = validatePassword(input.password, input); if (errors.length) throw new HttpError(400, errors[0], "PASSWORD_POLICY");
  const id = randomUUID(); const now = new Date(); const passwordHash = await hashPassword(input.password);
  await db.insert(users).values({ id, fullName: input.fullName, username: input.username, email: input.email, role: input.role, status: input.status, passwordHash, mustChangePassword: input.mustChangePassword, adminNotes: input.adminNotes, createdBy: actor.id, updatedBy: actor.id, createdAt: now, updatedAt: now });
  await db.insert(passwordHistory).values({ id: randomUUID(), userId: id, passwordHash, createdAt: now });
  await writeAudit({ actor, action: "USER_CREATED", category: "USER_MANAGEMENT", targetType: "USER", targetId: id, targetName: input.email, newValues: { ...input, password: "[REDACTED]" }, meta });
  return getUser(id);
}

async function guardLastAdmin(target: { id: string; role: Role; status: UserStatus }, next: { role?: Role; status?: UserStatus }, actorId: string) {
  const nextRole = next.role ?? target.role; const nextStatus = next.status ?? target.status;
  if (target.id === actorId && nextStatus !== "ACTIVE") throw new HttpError(400, "You cannot disable or lock your own account", "SELF_ACCOUNT_PROTECTION");
  if (target.role === "ADMIN" && (nextRole !== "ADMIN" || nextStatus !== "ACTIVE")) {
    const rows = await db.select({ count: count() }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE")));
    if ((rows[0]?.count ?? 0) <= 1) throw new HttpError(400, "The last active administrator cannot be disabled or demoted", "LAST_ADMIN_PROTECTION");
  }
}

export async function updateUser(id: string, changes: Partial<{ fullName: string; username: string; email: string; role: Role; status: UserStatus; mustChangePassword: boolean; adminNotes: string | null }>, actor: Actor, meta: RequestMeta) {
  const previous = await getUser(id); if (!previous) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  await guardLastAdmin(previous, changes, actor.id);
  const update = { ...changes, updatedBy: actor.id, updatedAt: new Date(), ...(changes.status === "ARCHIVED" ? { archivedAt: new Date() } : {}) };
  await db.update(users).set(update).where(eq(users.id, id));
  if ((changes.status && changes.status !== "ACTIVE") || (changes.role && changes.role !== previous.role)) await revokeUserSessions(id);
  const current = await getUser(id);
  const action = changes.role && changes.role !== previous.role ? "USER_ROLE_CHANGED" : changes.status && changes.status !== previous.status ? `USER_${changes.status}` : "USER_UPDATED";
  await writeAudit({ actor, action, category: "USER_MANAGEMENT", targetType: "USER", targetId: id, targetName: current?.email, previousValues: previous, newValues: current, meta });
  return current;
}

export async function resetUserPassword(id: string, password: string, actor: Actor, meta: RequestMeta) {
  const target = await getUser(id); if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  const errors = validatePassword(password, target); if (errors.length) throw new HttpError(400, errors[0], "PASSWORD_POLICY");
  const passwordHash = await hashPassword(password); const now = new Date();
  await db.update(users).set({ passwordHash, mustChangePassword: true, passwordChangedAt: now, updatedAt: now, updatedBy: actor.id }).where(eq(users.id, id));
  await db.insert(passwordHistory).values({ id: randomUUID(), userId: id, passwordHash, createdAt: now });
  await revokeUserSessions(id);
  await writeAudit({ actor, action: "PASSWORD_RESET", category: "SECURITY", targetType: "USER", targetId: id, targetName: target.email, newValues: { password: "[REDACTED]", mustChangePassword: true }, meta });
}
