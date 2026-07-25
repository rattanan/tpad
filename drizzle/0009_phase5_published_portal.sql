ALTER TABLE dashboards ADD COLUMN slug varchar(190) NULL AFTER name;
ALTER TABLE dashboards ADD UNIQUE INDEX dashboards_slug_uq (slug);
ALTER TABLE dashboards ADD COLUMN thumbnail_url text NULL AFTER category;
ALTER TABLE dashboards ADD COLUMN underlying_data_allowed boolean NOT NULL DEFAULT false AFTER ai_copilot_allowed;
ALTER TABLE dashboards ADD COLUMN drill_down_allowed boolean NOT NULL DEFAULT false AFTER underlying_data_allowed;
ALTER TABLE dashboards ADD COLUMN is_featured boolean NOT NULL DEFAULT false AFTER drill_down_allowed;
ALTER TABLE dashboards ADD COLUMN view_count int NOT NULL DEFAULT 0 AFTER is_featured;
ALTER TABLE dashboards ADD COLUMN last_data_refresh_at datetime(3) NULL AFTER view_count;

ALTER TABLE dashboard_publications ADD COLUMN allowed_user_ids_json longtext NULL AFTER allowed_roles_json;
ALTER TABLE dashboard_publications ADD COLUMN viewer_configuration_json longtext NULL AFTER allowed_user_ids_json;
ALTER TABLE dashboard_publications ADD COLUMN underlying_data_allowed boolean NOT NULL DEFAULT false AFTER ai_copilot_allowed;
ALTER TABLE dashboard_publications ADD COLUMN drill_down_allowed boolean NOT NULL DEFAULT false AFTER underlying_data_allowed;

CREATE TABLE dashboard_permissions (
  id varchar(36) NOT NULL PRIMARY KEY, dashboard_id varchar(36) NOT NULL, user_id varchar(36) NULL,
  role enum('ADMIN','DATA_SOURCE_CREATOR','DASHBOARD_CREATOR','VIEWER') NULL,
  permission enum('VIEW','EXPORT','UNDERLYING_DATA','USE_AI','EXECUTIVE_SUMMARY') NOT NULL,
  granted_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, revoked_at datetime(3) NULL,
  INDEX dashboard_permissions_dashboard_idx (dashboard_id), INDEX dashboard_permissions_user_idx (user_id),
  CONSTRAINT dashboard_permissions_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE,
  CONSTRAINT dashboard_permissions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE dashboard_favorites (
  user_id varchar(36) NOT NULL, dashboard_id varchar(36) NOT NULL, created_at datetime(3) NOT NULL,
  PRIMARY KEY (user_id, dashboard_id), INDEX dashboard_favorites_dashboard_idx (dashboard_id),
  CONSTRAINT dashboard_favorites_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT dashboard_favorites_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);
CREATE TABLE dashboard_recent_views (
  user_id varchar(36) NOT NULL, dashboard_id varchar(36) NOT NULL, last_viewed_at datetime(3) NOT NULL, view_count int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, dashboard_id), INDEX dashboard_recent_views_last_idx (last_viewed_at),
  CONSTRAINT dashboard_recent_views_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT dashboard_recent_views_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);
CREATE TABLE dashboard_view_events (
  id varchar(36) NOT NULL PRIMARY KEY, user_id varchar(36) NOT NULL, dashboard_id varchar(36) NOT NULL,
  event_type enum('VIEW','FILTER_APPLY','FILTER_CLEAR','WIDGET_RETRY','FAVORITE','UNFAVORITE','AI_CHAT','EXECUTIVE_SUMMARY','EXPORT') NOT NULL,
  widget_id varchar(36) NULL, parameters_json longtext NULL, created_at datetime(3) NOT NULL,
  INDEX dashboard_view_events_dashboard_idx (dashboard_id), INDEX dashboard_view_events_created_idx (created_at),
  CONSTRAINT dashboard_view_events_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT dashboard_view_events_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);
CREATE TABLE ai_conversations (
  id varchar(36) NOT NULL PRIMARY KEY, user_id varchar(36) NOT NULL, dashboard_id varchar(36) NOT NULL, title varchar(190) NOT NULL,
  filters_snapshot_json longtext NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3) NULL,
  INDEX ai_conversations_user_idx (user_id), INDEX ai_conversations_dashboard_idx (dashboard_id),
  CONSTRAINT ai_conversations_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ai_conversations_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);
CREATE TABLE ai_messages (
  id varchar(36) NOT NULL PRIMARY KEY, conversation_id varchar(36) NOT NULL, role enum('USER','ASSISTANT') NOT NULL, content longtext NOT NULL,
  widget_id varchar(36) NULL, filters_snapshot_json longtext NULL, model varchar(120) NULL, input_tokens int NULL, output_tokens int NULL,
  latency_ms int NULL, error_code varchar(80) NULL, created_at datetime(3) NOT NULL,
  INDEX ai_messages_conversation_idx (conversation_id, created_at),
  CONSTRAINT ai_messages_conversation_fk FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);
CREATE TABLE ai_usage_logs (
  id varchar(36) NOT NULL PRIMARY KEY, user_id varchar(36) NOT NULL, dashboard_id varchar(36) NOT NULL, conversation_id varchar(36) NULL,
  request_type enum('CHAT','EXECUTIVE_SUMMARY') NOT NULL, model varchar(120) NOT NULL, input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0, latency_ms int NOT NULL DEFAULT 0, status enum('SUCCESS','FAILED','REFUSED') NOT NULL,
  error_code varchar(80) NULL, created_at datetime(3) NOT NULL,
  INDEX ai_usage_logs_dashboard_idx (dashboard_id), INDEX ai_usage_logs_created_idx (created_at),
  CONSTRAINT ai_usage_logs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ai_usage_logs_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE,
  CONSTRAINT ai_usage_logs_conversation_fk FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL
);

UPDATE dashboards SET slug = CONCAT('dashboard-', id) WHERE slug IS NULL;
