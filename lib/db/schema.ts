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

export const dataSourceStatusValues = ["DRAFT", "ACTIVE", "INACTIVE", "CONNECTION_ERROR", "ARCHIVED"] as const;
export const connectionStatusValues = ["NOT_TESTED", "CONNECTED", "FAILED", "TIMEOUT"] as const;
export const metadataSyncStatusValues = ["NOT_SYNCED", "SYNCING", "SYNCED", "PARTIAL", "FAILED"] as const;
export const environmentValues = ["DEVELOPMENT", "TEST", "UAT", "PRODUCTION"] as const;
export const accessPermissionValues = ["VIEW_METADATA", "PREVIEW_DATA", "USE_FOR_DASHBOARD", "EDIT_METADATA", "MANAGE_CONNECTION", "SYNC_METADATA"] as const;
export type DataSourceAccessPermission = (typeof accessPermissionValues)[number];

export const dataSources = mysqlTable("data_sources", {
  id: varchar("id", { length: 36 }).primaryKey(), name: varchar("name", { length: 160 }).notNull(), description: text("description"),
  databaseType: varchar("database_type", { length: 40 }).notNull().default("ORACLE"), environment: mysqlEnum("environment", environmentValues).notNull(),
  status: mysqlEnum("status", dataSourceStatusValues).notNull().default("DRAFT"), host: varchar("host", { length: 255 }).notNull(), port: int("port").notNull().default(1521),
  connectionMode: mysqlEnum("connection_mode", ["SERVICE_NAME", "SID", "CONNECTION_STRING"]).notNull().default("SERVICE_NAME"), serviceName: varchar("service_name", { length: 255 }), sid: varchar("sid", { length: 255 }), connectionString: text("connection_string"),
  username: varchar("username", { length: 255 }).notNull(), encryptedPassword: longtext("encrypted_password").notNull(), passwordIv: varchar("password_iv", { length: 64 }).notNull(), passwordAuthTag: varchar("password_auth_tag", { length: 64 }).notNull(), passwordKeyVersion: varchar("password_key_version", { length: 40 }).notNull().default("v1"),
  defaultSchema: varchar("default_schema", { length: 128 }), allowedSchemas: longtext("allowed_schemas"), connectionTimeoutSeconds: int("connection_timeout_seconds").notNull().default(10), queryTimeoutSeconds: int("query_timeout_seconds").notNull().default(30),
  connectionStatus: mysqlEnum("connection_status", connectionStatusValues).notNull().default("NOT_TESTED"), metadataSyncStatus: mysqlEnum("metadata_sync_status", metadataSyncStatusValues).notNull().default("NOT_SYNCED"),
  lastConnectionTestAt: datetime("last_connection_test_at", { mode: "date", fsp: 3 }), lastSuccessfulConnectionAt: datetime("last_successful_connection_at", { mode: "date", fsp: 3 }), lastMetadataSyncAt: datetime("last_metadata_sync_at", { mode: "date", fsp: 3 }), databaseVersion: varchar("database_version", { length: 255 }),
  ownerUserId: varchar("owner_user_id", { length: 36 }).notNull().references(() => users.id), createdBy: varchar("created_by", { length: 36 }).notNull(), updatedBy: varchar("updated_by", { length: 36 }).notNull(), createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(), updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(), archivedAt: datetime("archived_at", { mode: "date", fsp: 3 }),
}, (t) => [uniqueIndex("data_sources_name_environment_uq").on(t.name, t.environment), index("data_sources_status_idx").on(t.status), index("data_sources_owner_idx").on(t.ownerUserId)]);

export const dataSourceSchemas = mysqlTable("data_source_schemas", {
  id: varchar("id", { length: 36 }).primaryKey(), dataSourceId: varchar("data_source_id", { length: 36 }).notNull().references(() => dataSources.id, { onDelete: "cascade" }), schemaName: varchar("schema_name", { length: 128 }).notNull(), tableCount: int("table_count").notNull().default(0), viewCount: int("view_count").notNull().default(0), isIncluded: boolean("is_included").notNull().default(false), status: mysqlEnum("status", ["ACTIVE", "MISSING", "EXCLUDED", "ARCHIVED"]).notNull().default("ACTIVE"), lastSyncedAt: datetime("last_synced_at", { mode: "date", fsp: 3 }), createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(), updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, (t) => [uniqueIndex("data_source_schemas_uq").on(t.dataSourceId, t.schemaName)]);

export const dataSourceTables = mysqlTable("data_source_tables", {
  id: varchar("id", { length: 36 }).primaryKey(), dataSourceId: varchar("data_source_id", { length: 36 }).notNull().references(() => dataSources.id, { onDelete: "cascade" }), schemaId: varchar("schema_id", { length: 36 }).references(() => dataSourceSchemas.id, { onDelete: "set null" }), schemaName: varchar("schema_name", { length: 128 }).notNull(), tableName: varchar("table_name", { length: 128 }).notNull(), businessName: varchar("business_name", { length: 255 }), objectType: mysqlEnum("object_type", ["TABLE", "VIEW"]).notNull(), description: text("description"), estimatedRowCount: int("estimated_row_count"), lastAnalyzedAt: datetime("last_analyzed_at", { mode: "date", fsp: 3 }), isPartitioned: boolean("is_partitioned").notNull().default(false), isTemporary: boolean("is_temporary").notNull().default(false), isIncluded: boolean("is_included").notNull().default(true), status: mysqlEnum("status", ["ACTIVE", "MISSING", "EXCLUDED", "ARCHIVED"]).notNull().default("ACTIVE"), metadataHash: varchar("metadata_hash", { length: 64 }), lastSyncedAt: datetime("last_synced_at", { mode: "date", fsp: 3 }), createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(), updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, (t) => [uniqueIndex("data_source_tables_uq").on(t.dataSourceId, t.schemaName, t.tableName), index("data_source_tables_source_idx").on(t.dataSourceId)]);

export const dataSourceColumns = mysqlTable("data_source_columns", {
  id: varchar("id", { length: 36 }).primaryKey(), tableId: varchar("table_id", { length: 36 }).notNull().references(() => dataSourceTables.id, { onDelete: "cascade" }), columnName: varchar("column_name", { length: 128 }).notNull(), businessName: varchar("business_name", { length: 255 }), description: text("description"), dataType: varchar("data_type", { length: 128 }).notNull(), dataLength: int("data_length"), numericPrecision: int("numeric_precision"), numericScale: int("numeric_scale"), nullable: boolean("nullable").notNull().default(true), defaultValue: text("default_value"), ordinalPosition: int("ordinal_position").notNull(), isPrimaryKey: boolean("is_primary_key").notNull().default(false), isForeignKey: boolean("is_foreign_key").notNull().default(false), isIncluded: boolean("is_included").notNull().default(true), sensitivityType: mysqlEnum("sensitivity_type", ["NONE", "PERSONAL_DATA", "SENSITIVE_PERSONAL_DATA", "FINANCIAL", "CREDENTIAL", "CONTACT", "IDENTIFIER", "CONFIDENTIAL"]).notNull().default("NONE"), suggestedSensitivityType: mysqlEnum("suggested_sensitivity_type", ["NONE", "PERSONAL_DATA", "SENSITIVE_PERSONAL_DATA", "FINANCIAL", "CREDENTIAL", "CONTACT", "IDENTIFIER", "CONFIDENTIAL"]).notNull().default("NONE"), maskingRule: varchar("masking_rule", { length: 80 }), status: mysqlEnum("status", ["ACTIVE", "MISSING", "EXCLUDED", "ARCHIVED"]).notNull().default("ACTIVE"), metadataHash: varchar("metadata_hash", { length: 64 }), createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(), updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, (t) => [uniqueIndex("data_source_columns_uq").on(t.tableId, t.columnName)]);

export const dataSourceRelationships = mysqlTable("data_source_relationships", {
  id: varchar("id", { length: 36 }).primaryKey(), dataSourceId: varchar("data_source_id", { length: 36 }).notNull().references(() => dataSources.id, { onDelete: "cascade" }), sourceTableId: varchar("source_table_id", { length: 36 }).notNull().references(() => dataSourceTables.id, { onDelete: "cascade" }), sourceColumnId: varchar("source_column_id", { length: 36 }).references(() => dataSourceColumns.id, { onDelete: "set null" }), targetTableId: varchar("target_table_id", { length: 36 }).notNull().references(() => dataSourceTables.id, { onDelete: "cascade" }), targetColumnId: varchar("target_column_id", { length: 36 }).references(() => dataSourceColumns.id, { onDelete: "set null" }), constraintName: varchar("constraint_name", { length: 128 }), relationshipType: varchar("relationship_type", { length: 40 }).notNull().default("MANY_TO_ONE"), discoveryMethod: mysqlEnum("discovery_method", ["FOREIGN_KEY", "NAME_PATTERN", "MANUAL"]).notNull().default("FOREIGN_KEY"), confidenceScore: int("confidence_score").notNull().default(100), status: mysqlEnum("status", ["SUGGESTED", "CONFIRMED", "REJECTED", "DISABLED"]).notNull().default("CONFIRMED"), reviewedBy: varchar("reviewed_by", { length: 36 }), reviewedAt: datetime("reviewed_at", { mode: "date", fsp: 3 }), createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(), updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull(),
}, (t) => [index("relationships_source_idx").on(t.sourceTableId), index("relationships_target_idx").on(t.targetTableId), uniqueIndex("relationships_constraint_uq").on(t.dataSourceId, t.constraintName, t.sourceColumnId)]);

export const dataSourceIndexes = mysqlTable("data_source_indexes", { id: varchar("id", { length: 36 }).primaryKey(), tableId: varchar("table_id", { length: 36 }).notNull().references(() => dataSourceTables.id, { onDelete: "cascade" }), indexName: varchar("index_name", { length: 128 }).notNull(), columnName: varchar("column_name", { length: 128 }).notNull(), columnPosition: int("column_position").notNull(), isUnique: boolean("is_unique").notNull().default(false), status: mysqlEnum("status", ["ACTIVE", "MISSING", "ARCHIVED"]).notNull().default("ACTIVE"), createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(), updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull() }, (t) => [uniqueIndex("data_source_indexes_uq").on(t.tableId, t.indexName, t.columnName), index("data_source_indexes_table_idx").on(t.tableId)]);

export const metadataSyncRuns = mysqlTable("metadata_sync_runs", {
  id: varchar("id", { length: 36 }).primaryKey(), dataSourceId: varchar("data_source_id", { length: 36 }).notNull().references(() => dataSources.id, { onDelete: "cascade" }), syncType: mysqlEnum("sync_type", ["FULL", "INCREMENTAL", "SCHEMA", "TABLE"]).notNull().default("FULL"), status: mysqlEnum("status", ["QUEUED", "RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]).notNull().default("QUEUED"), progressStep: varchar("progress_step", { length: 80 }), startedBy: varchar("started_by", { length: 36 }).notNull(), startedAt: datetime("started_at", { mode: "date", fsp: 3 }).notNull(), completedAt: datetime("completed_at", { mode: "date", fsp: 3 }), durationMs: int("duration_ms"), schemasProcessed: int("schemas_processed").notNull().default(0), tablesFound: int("tables_found").notNull().default(0), viewsFound: int("views_found").notNull().default(0), columnsFound: int("columns_found").notNull().default(0), primaryKeysFound: int("primary_keys_found").notNull().default(0), foreignKeysFound: int("foreign_keys_found").notNull().default(0), relationshipsFound: int("relationships_found").notNull().default(0), newObjects: int("new_objects").notNull().default(0), updatedObjects: int("updated_objects").notNull().default(0), missingObjects: int("missing_objects").notNull().default(0), warningCount: int("warning_count").notNull().default(0), errorCount: int("error_count").notNull().default(0), errorSummary: text("error_summary"), requestId: varchar("request_id", { length: 36 }).notNull(),
}, (t) => [index("sync_runs_source_idx").on(t.dataSourceId), index("sync_runs_started_idx").on(t.startedAt)]);

export const dataSourceAccess = mysqlTable("data_source_access", {
  id: varchar("id", { length: 36 }).primaryKey(), dataSourceId: varchar("data_source_id", { length: 36 }).notNull().references(() => dataSources.id, { onDelete: "cascade" }), userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }), role: mysqlEnum("role", roleValues), permission: mysqlEnum("permission", accessPermissionValues).notNull(), grantedBy: varchar("granted_by", { length: 36 }).notNull(), grantedAt: datetime("granted_at", { mode: "date", fsp: 3 }).notNull(), revokedAt: datetime("revoked_at", { mode: "date", fsp: 3 }),
}, (t) => [index("data_source_access_source_idx").on(t.dataSourceId), index("data_source_access_user_idx").on(t.userId)]);

export const dataSourceConnectionTests = mysqlTable("data_source_connection_tests", { id: varchar("id", { length: 36 }).primaryKey(), dataSourceId: varchar("data_source_id", { length: 36 }).notNull().references(() => dataSources.id, { onDelete: "cascade" }), status: mysqlEnum("status", connectionStatusValues).notNull(), responseTimeMs: int("response_time_ms"), databaseVersion: varchar("database_version", { length: 255 }), currentUser: varchar("current_user", { length: 255 }), currentSchema: varchar("current_schema", { length: 255 }), errorCode: varchar("error_code", { length: 32 }), errorCategory: varchar("error_category", { length: 80 }), errorMessage: varchar("error_message", { length: 255 }), testedBy: varchar("tested_by", { length: 36 }).notNull(), ipAddress: varchar("ip_address", { length: 64 }), requestId: varchar("request_id", { length: 36 }).notNull(), testedAt: datetime("tested_at", { mode: "date", fsp: 3 }).notNull() }, (t) => [index("connection_tests_source_idx").on(t.dataSourceId)]);
