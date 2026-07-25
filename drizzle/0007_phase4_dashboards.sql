CREATE TABLE IF NOT EXISTS dashboard_layout_templates (
  id varchar(36) PRIMARY KEY, code varchar(80) NOT NULL, name varchar(160) NOT NULL, description text,
  grid_columns int NOT NULL DEFAULT 12, definition_json longtext NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL,
  UNIQUE KEY dashboard_layout_templates_code_uq (code)
);

CREATE TABLE IF NOT EXISTS dashboards (
  id varchar(36) PRIMARY KEY, name varchar(190) NOT NULL, description text, category varchar(80) NOT NULL,
  owner_user_id varchar(36) NOT NULL, business_owner_user_id varchar(36), current_draft_version_id varchar(36), current_published_version_id varchar(36),
  status enum('DRAFT','VALIDATING','READY_FOR_REVIEW','IN_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED','UNPUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  visibility enum('PRIVATE','ROLE','WORKSPACE') NOT NULL DEFAULT 'PRIVATE', export_allowed boolean NOT NULL DEFAULT false, ai_copilot_allowed boolean NOT NULL DEFAULT true,
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, archived_at datetime(3),
  CONSTRAINT dashboards_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT dashboards_business_owner_fk FOREIGN KEY (business_owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY dashboards_owner_idx (owner_user_id), KEY dashboards_status_idx (status)
);

CREATE TABLE IF NOT EXISTS dashboard_versions (
  id varchar(36) PRIMARY KEY, dashboard_id varchar(36) NOT NULL, version_number int NOT NULL,
  business_objective text NOT NULL, target_audience varchar(500) NOT NULL, business_questions_json longtext NOT NULL,
  refresh_expectation varchar(120) NOT NULL, default_date_range varchar(80) NOT NULL, tags_json longtext,
  business_context_model_id varchar(36) NOT NULL, business_context_version_id varchar(36) NOT NULL, data_source_id varchar(36) NOT NULL,
  layout_template_id varchar(36), layout_json longtext NOT NULL,
  status enum('DRAFT','READY_FOR_REVIEW','IN_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED','SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
  revision int NOT NULL DEFAULT 1, change_summary text, submitted_at datetime(3), submitted_by varchar(36), approved_at datetime(3), approved_by varchar(36), published_at datetime(3), published_by varchar(36),
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL,
  CONSTRAINT dashboard_versions_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_versions_model_fk FOREIGN KEY (business_context_model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_versions_context_version_fk FOREIGN KEY (business_context_version_id) REFERENCES business_context_model_versions(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_versions_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_versions_layout_fk FOREIGN KEY (layout_template_id) REFERENCES dashboard_layout_templates(id) ON DELETE RESTRICT,
  UNIQUE KEY dashboard_versions_number_uq (dashboard_id, version_number), KEY dashboard_versions_dashboard_idx (dashboard_id), KEY dashboard_versions_status_idx (status)
);

CREATE TABLE IF NOT EXISTS dashboard_blocks (
  id varchar(36) PRIMARY KEY, dashboard_version_id varchar(36) NOT NULL,
  block_type enum('KPI_CARD','TREND_CHART','COMPARISON_CHART','DISTRIBUTION_CHART','PROGRESS_STATUS','TABLE','PIVOT_TABLE','FUNNEL','EXCEPTION_LIST','TEXT_INSIGHT','FILTER') NOT NULL,
  title varchar(190) NOT NULL, description text, business_question text, intended_audience varchar(500), decision_supported text,
  kpi_id varchar(36), kpi_version int, dimension_field_id varchar(36),
  visualization_type enum('NUMBER','LINE','AREA','BAR','HORIZONTAL_BAR','STACKED_BAR','DONUT','PIE','TREEMAP','PROGRESS','GAUGE','BULLET','TABLE','PIVOT','FUNNEL','EXCEPTION_LIST','TEXT') NOT NULL,
  query_plan_json longtext, generated_sql longtext, query_fingerprint varchar(64), bind_parameters_json longtext, filters_json longtext,
  visualization_config_json longtext, formatting_config_json longtext, position_json longtext NOT NULL,
  validation_status enum('NOT_VALIDATED','PASSED','PASSED_WITH_WARNING','FAILED') NOT NULL DEFAULT 'NOT_VALIDATED',
  preview_status enum('NOT_RUN','PASSED','FAILED','UNAVAILABLE') NOT NULL DEFAULT 'NOT_RUN', preview_json longtext, previewed_at datetime(3),
  is_hidden boolean NOT NULL DEFAULT false, is_locked boolean NOT NULL DEFAULT false, sort_order int NOT NULL DEFAULT 0,
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL,
  CONSTRAINT dashboard_blocks_version_fk FOREIGN KEY (dashboard_version_id) REFERENCES dashboard_versions(id) ON DELETE CASCADE,
  CONSTRAINT dashboard_blocks_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_blocks_dimension_fk FOREIGN KEY (dimension_field_id) REFERENCES business_fields(id) ON DELETE RESTRICT,
  KEY dashboard_blocks_version_idx (dashboard_version_id), KEY dashboard_blocks_kpi_idx (kpi_id)
);

CREATE TABLE IF NOT EXISTS dashboard_global_filters (
  id varchar(36) PRIMARY KEY, dashboard_version_id varchar(36) NOT NULL, name varchar(160) NOT NULL, business_field_id varchar(36) NOT NULL,
  filter_type enum('DATE_RANGE','SINGLE_SELECT','MULTI_SELECT','NUMERIC_RANGE','BOOLEAN') NOT NULL,
  default_value_json longtext, allowed_values_json longtext, applies_to_block_ids_json longtext,
  is_required boolean NOT NULL DEFAULT false, is_visible boolean NOT NULL DEFAULT true, runtime_editable boolean NOT NULL DEFAULT true, security_enforced boolean NOT NULL DEFAULT false,
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL,
  CONSTRAINT dashboard_global_filters_version_fk FOREIGN KEY (dashboard_version_id) REFERENCES dashboard_versions(id) ON DELETE CASCADE,
  CONSTRAINT dashboard_global_filters_field_fk FOREIGN KEY (business_field_id) REFERENCES business_fields(id) ON DELETE RESTRICT,
  KEY dashboard_global_filters_version_idx (dashboard_version_id)
);

CREATE TABLE IF NOT EXISTS dashboard_validation_findings (
  id varchar(36) PRIMARY KEY, dashboard_version_id varchar(36) NOT NULL, dashboard_block_id varchar(36),
  category enum('CONFIGURATION','BUSINESS_CONTEXT','KPI','QUERY','QUALITY','ACCESS') NOT NULL,
  severity enum('INFO','WARNING','ERROR') NOT NULL, code varchar(80) NOT NULL, message text NOT NULL, suggested_correction text,
  is_resolved boolean NOT NULL DEFAULT false, resolved_at datetime(3), resolved_by varchar(36), created_at datetime(3) NOT NULL,
  CONSTRAINT dashboard_validation_version_fk FOREIGN KEY (dashboard_version_id) REFERENCES dashboard_versions(id) ON DELETE CASCADE,
  CONSTRAINT dashboard_validation_block_fk FOREIGN KEY (dashboard_block_id) REFERENCES dashboard_blocks(id) ON DELETE CASCADE,
  KEY dashboard_validation_version_idx (dashboard_version_id), KEY dashboard_validation_block_idx (dashboard_block_id)
);

CREATE TABLE IF NOT EXISTS dashboard_ai_recommendations (
  id varchar(36) PRIMARY KEY, dashboard_version_id varchar(36) NOT NULL, dashboard_block_id varchar(36),
  recommendation_type enum('BLOCK_CONFIGURATION','KPI','DIMENSION','VISUALIZATION','LAYOUT','FILTER','COVERAGE','REDUNDANCY') NOT NULL,
  request_json longtext NOT NULL, context_json longtext NOT NULL, response_json longtext NOT NULL, confidence int NOT NULL,
  model_provider varchar(80) NOT NULL, model_name varchar(120) NOT NULL, decision enum('PENDING','ACCEPTED','REJECTED','MODIFIED') NOT NULL DEFAULT 'PENDING',
  decided_by varchar(36), decided_at datetime(3), created_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL,
  CONSTRAINT dashboard_ai_version_fk FOREIGN KEY (dashboard_version_id) REFERENCES dashboard_versions(id) ON DELETE CASCADE,
  CONSTRAINT dashboard_ai_block_fk FOREIGN KEY (dashboard_block_id) REFERENCES dashboard_blocks(id) ON DELETE CASCADE,
  KEY dashboard_ai_version_idx (dashboard_version_id), KEY dashboard_ai_decision_idx (decision)
);

CREATE TABLE IF NOT EXISTS dashboard_reviews (
  id varchar(36) PRIMARY KEY, dashboard_version_id varchar(36) NOT NULL, dashboard_block_id varchar(36),
  action enum('SUBMIT','COMMENT','APPROVE','REJECT','REQUEST_CHANGES','ACKNOWLEDGE_WARNING') NOT NULL, comment text,
  reviewer_id varchar(36) NOT NULL, created_at datetime(3) NOT NULL,
  CONSTRAINT dashboard_reviews_version_fk FOREIGN KEY (dashboard_version_id) REFERENCES dashboard_versions(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_reviews_block_fk FOREIGN KEY (dashboard_block_id) REFERENCES dashboard_blocks(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_reviews_reviewer_fk FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE RESTRICT,
  KEY dashboard_reviews_version_idx (dashboard_version_id)
);

CREATE TABLE IF NOT EXISTS dashboard_publications (
  id varchar(36) PRIMARY KEY, dashboard_id varchar(36) NOT NULL, dashboard_version_id varchar(36) NOT NULL,
  snapshot_json longtext NOT NULL, visibility enum('PRIVATE','ROLE','WORKSPACE') NOT NULL, allowed_roles_json longtext,
  export_allowed boolean NOT NULL DEFAULT false, ai_copilot_allowed boolean NOT NULL DEFAULT false,
  published_by varchar(36) NOT NULL, published_at datetime(3) NOT NULL, unpublished_at datetime(3),
  CONSTRAINT dashboard_publications_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_publications_version_fk FOREIGN KEY (dashboard_version_id) REFERENCES dashboard_versions(id) ON DELETE RESTRICT,
  CONSTRAINT dashboard_publications_user_fk FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY dashboard_publications_version_uq (dashboard_version_id), KEY dashboard_publications_dashboard_idx (dashboard_id)
);

ALTER TABLE dashboards
  ADD CONSTRAINT dashboards_draft_version_fk FOREIGN KEY (current_draft_version_id) REFERENCES dashboard_versions(id) ON DELETE SET NULL,
  ADD CONSTRAINT dashboards_published_version_fk FOREIGN KEY (current_published_version_id) REFERENCES dashboard_versions(id) ON DELETE SET NULL;

INSERT IGNORE INTO dashboard_layout_templates (id,code,name,description,grid_columns,definition_json,is_active,created_at,updated_at) VALUES
('10000000-0000-4000-8000-000000000001','EXECUTIVE_OVERVIEW','Executive Overview','KPI cards, trend, breakdown, detail, and commentary.',12,'{"suggestedBlocks":["KPI_CARD","KPI_CARD","TREND_CHART","COMPARISON_CHART","TABLE","TEXT_INSIGHT"],"responsive":"stack"}',true,NOW(3),NOW(3)),
('10000000-0000-4000-8000-000000000002','OPERATIONAL_MONITORING','Operational Monitoring','Status cards, exceptions, workload, trend, and detail.',12,'{"suggestedBlocks":["KPI_CARD","EXCEPTION_LIST","TREND_CHART","COMPARISON_CHART","TABLE"],"responsive":"stack"}',true,NOW(3),NOW(3)),
('10000000-0000-4000-8000-000000000003','ANALYSIS_DASHBOARD','Analysis Dashboard','Filters, comparisons, breakdown, and detailed analysis.',12,'{"suggestedBlocks":["FILTER","KPI_CARD","COMPARISON_CHART","DISTRIBUTION_CHART","TABLE"],"responsive":"stack"}',true,NOW(3),NOW(3)),
('10000000-0000-4000-8000-000000000004','KPI_SCORECARD','KPI Scorecard','KPI cards, progress, sparklines, and target comparison.',12,'{"suggestedBlocks":["KPI_CARD","PROGRESS_STATUS","TREND_CHART","TABLE","TEXT_INSIGHT"],"responsive":"stack"}',true,NOW(3),NOW(3)),
('10000000-0000-4000-8000-000000000005','BLANK_GRID','Blank Grid','Empty responsive grid for manual block composition.',12,'{"suggestedBlocks":[],"responsive":"stack"}',true,NOW(3),NOW(3));
