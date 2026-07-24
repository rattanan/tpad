import {
  boolean,
  datetime,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const roleValues = ["ADMIN", "DATA_SOURCE_CREATOR", "DASHBOARD_CREATOR", "VIEWER"] as const;
export const statusValues = ["ACTIVE", "INACTIVE", "LOCKED", "ARCHIVED"] as const;
export type Role = (typeof roleValues)[number];
export type UserStatus = (typeof statusValues)[number];

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  username: varchar("username", { length: 80 }).notNull(),
  email: varchar("email", { length: 190 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", roleValues).notNull().default("VIEWER"),
  status: mysqlEnum("status", statusValues).notNull().default("ACTIVE"),
  adminNotes: text("admin_notes"),
  failedLoginAttempts: int("failed_login_attempts").notNull().default(0),
  failedLoginWindowStartedAt: datetime("failed_login_window_started_at", { mode: "date", fsp: 3 }),
  lockedUntil: datetime("locked_until", { mode: "date", fsp: 3 }),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  lastLoginAt: datetime("last_login_at", { mode: "date", fsp: 3 }),
  passwordChangedAt: datetime("password_changed_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
  createdBy: varchar("created_by", { length: 36 }),
  updatedBy: varchar("updated_by", { length: 36 }),
  archivedAt: datetime("archived_at", { mode: "date", fsp: 3 }),
}, (table) => [
  uniqueIndex("users_email_uq").on(table.email),
  uniqueIndex("users_username_uq").on(table.username),
  index("users_status_idx").on(table.status),
  index("users_role_idx").on(table.role),
]);

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionTokenHash: varchar("session_token_hash", { length: 64 }).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  lastActiveAt: datetime("last_active_at", { mode: "date", fsp: 3 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  revokedAt: datetime("revoked_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
}, (table) => [
  uniqueIndex("sessions_token_uq").on(table.sessionTokenHash),
  index("sessions_user_idx").on(table.userId),
  index("sessions_expires_idx").on(table.expiresAt),
]);

export const loginHistory = mysqlTable("login_history", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  loginIdentifier: varchar("login_identifier", { length: 190 }).notNull(),
  eventType: mysqlEnum("event_type", ["LOGIN", "LOGOUT", "SESSION"]).notNull(),
  status: mysqlEnum("status", ["SUCCESS", "FAILED", "LOCKED", "LOGOUT", "SESSION_EXPIRED"]).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  browser: varchar("browser", { length: 80 }),
  operatingSystem: varchar("operating_system", { length: 80 }),
  deviceType: varchar("device_type", { length: 40 }),
  failureReason: varchar("failure_reason", { length: 160 }),
  loggedInAt: datetime("logged_in_at", { mode: "date", fsp: 3 }),
  loggedOutAt: datetime("logged_out_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
}, (table) => [
  index("login_history_user_idx").on(table.userId),
  index("login_history_created_idx").on(table.createdAt),
  index("login_history_status_idx").on(table.status),
]);

export const auditLogs = mysqlTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  actorUserId: varchar("actor_user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  actorName: varchar("actor_name", { length: 160 }),
  action: varchar("action", { length: 100 }).notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  targetType: varchar("target_type", { length: 60 }),
  targetId: varchar("target_id", { length: 80 }),
  targetName: varchar("target_name", { length: 190 }),
  result: mysqlEnum("result", ["SUCCESS", "FAILED"]).notNull(),
  description: text("description"),
  previousValues: longtext("previous_values"),
  newValues: longtext("new_values"),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  requestId: varchar("request_id", { length: 36 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
}, (table) => [
  index("audit_actor_idx").on(table.actorUserId),
  index("audit_action_idx").on(table.action),
  index("audit_target_idx").on(table.targetType, table.targetId),
  index("audit_created_idx").on(table.createdAt),
]);

export const passwordHistory = mysqlTable("password_history", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
}, (table) => [index("password_history_user_idx").on(table.userId, table.createdAt)]);

export const loginRateLimits = mysqlTable("login_rate_limits", {
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  windowStartedAt: datetime("window_started_at", { mode: "date", fsp: 3 }).notNull(),
  attempts: int("attempts").notNull().default(0),
  blockedUntil: datetime("blocked_until", { mode: "date", fsp: 3 }),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, (table) => [primaryKey({ columns: [table.ipHash] })]);
