ALTER TABLE data_source_access MODIFY COLUMN permission enum('VIEW_METADATA','PREVIEW_DATA','USE_FOR_DASHBOARD','EDIT_METADATA','MANAGE_CONNECTION','SYNC_METADATA','MANAGE_BUSINESS_CONTEXT','PUBLISH_BUSINESS_CONTEXT','USE_BUSINESS_CONTEXT') NOT NULL;

CREATE TABLE IF NOT EXISTS business_context_models (
  id varchar(36) PRIMARY KEY,
  data_source_id varchar(36) NOT NULL,
  name varchar(190) NOT NULL,
  description text,
  schema_name varchar(128) NOT NULL,
  version int NOT NULL DEFAULT 1,
  status enum('DRAFT','AI_ANALYZING','READY_FOR_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  submitted_at datetime(3), submitted_by varchar(36), approved_at datetime(3), approved_by varchar(36), published_at datetime(3), published_by varchar(36),
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bcm_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  UNIQUE KEY bcm_source_name_uq (data_source_id,name), KEY bcm_status_idx (status), KEY bcm_source_idx (data_source_id)
);

CREATE TABLE IF NOT EXISTS business_domains (
  id varchar(36) PRIMARY KEY, data_source_id varchar(36), model_id varchar(36), code varchar(80) NOT NULL, name varchar(160) NOT NULL, name_th varchar(160), description text,
  version int NOT NULL DEFAULT 1, status enum('DRAFT','SUGGESTED','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bd_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  CONSTRAINT bd_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  UNIQUE KEY bd_model_code_uq (model_id,code), KEY bd_source_idx (data_source_id)
);

CREATE TABLE IF NOT EXISTS business_objects (
  id varchar(36) PRIMARY KEY, model_id varchar(36) NOT NULL, data_source_id varchar(36) NOT NULL, physical_table_id varchar(36) NOT NULL,
  technical_name varchar(128) NOT NULL, database_schema varchar(128) NOT NULL, business_name varchar(255) NOT NULL, short_name varchar(80), description text, business_domain_id varchar(36),
  object_type enum('TRANSACTION','MASTER_DATA','REFERENCE_DATA','SNAPSHOT','AGGREGATE','BRIDGE','VIEW','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN', primary_key_definition longtext, default_date_field_id varchar(36), record_grain varchar(500),
  data_owner varchar(190), data_steward varchar(190), tags longtext, sensitivity_level enum('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED') NOT NULL DEFAULT 'INTERNAL', usage_status enum('ACTIVE','DEPRECATED','HIDDEN') NOT NULL DEFAULT 'ACTIVE', ai_usage_allowed boolean NOT NULL DEFAULT false,
  approval_status enum('DRAFT','SUGGESTED','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT', notes text, layout_x int NOT NULL DEFAULT 0, layout_y int NOT NULL DEFAULT 0, version int NOT NULL DEFAULT 1,
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bo_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT bo_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  CONSTRAINT bo_table_fk FOREIGN KEY (physical_table_id) REFERENCES data_source_tables(id) ON DELETE RESTRICT,
  CONSTRAINT bo_domain_fk FOREIGN KEY (business_domain_id) REFERENCES business_domains(id) ON DELETE SET NULL,
  UNIQUE KEY bo_model_table_uq (model_id,physical_table_id), KEY bo_model_idx (model_id), KEY bo_approval_idx (approval_status)
);

CREATE TABLE IF NOT EXISTS business_fields (
  id varchar(36) PRIMARY KEY, model_id varchar(36) NOT NULL, data_source_id varchar(36) NOT NULL, business_object_id varchar(36) NOT NULL, physical_column_id varchar(36) NOT NULL,
  physical_column_name varchar(128) NOT NULL, business_name varchar(255) NOT NULL, description text, physical_data_type varchar(128) NOT NULL,
  business_type enum('TEXT','NUMBER','CURRENCY','PERCENTAGE','BOOLEAN','DATE','DATETIME','DURATION','QUANTITY','STATUS','IDENTIFIER','GEOGRAPHIC','URL','EMAIL','PHONE','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  field_role enum('DIMENSION','MEASURE','IDENTIFIER','DATE_DIMENSION','STATUS_DIMENSION','FOREIGN_KEY','TECHNICAL_FIELD','SENSITIVE_FIELD','IGNORED') NOT NULL DEFAULT 'DIMENSION',
  aggregation_rule enum('SUM','AVERAGE','COUNT','COUNT_DISTINCT','MINIMUM','MAXIMUM','LATEST','EARLIEST','NONE','CUSTOM') NOT NULL DEFAULT 'NONE',
  format varchar(80), unit varchar(80), currency varchar(12), time_zone varchar(80), nullable boolean NOT NULL DEFAULT true, is_unique boolean NOT NULL DEFAULT false, is_primary_key boolean NOT NULL DEFAULT false, is_foreign_key boolean NOT NULL DEFAULT false, dimension_group varchar(120), example_values longtext,
  sensitivity_classification enum('NONE','PERSONAL_DATA','SENSITIVE_PERSONAL_DATA','FINANCIAL','CREDENTIAL','CONTACT','IDENTIFIER','CONFIDENTIAL') NOT NULL DEFAULT 'NONE', masking_rule varchar(80), ai_usage_allowed boolean NOT NULL DEFAULT false,
  filterable boolean NOT NULL DEFAULT true, groupable boolean NOT NULL DEFAULT true, sortable boolean NOT NULL DEFAULT true, searchable boolean NOT NULL DEFAULT false, visible_to_dashboard_creator boolean NOT NULL DEFAULT false,
  approval_status enum('DRAFT','SUGGESTED','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT', version int NOT NULL DEFAULT 1,
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bf_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT bf_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  CONSTRAINT bf_object_fk FOREIGN KEY (business_object_id) REFERENCES business_objects(id) ON DELETE RESTRICT,
  CONSTRAINT bf_column_fk FOREIGN KEY (physical_column_id) REFERENCES data_source_columns(id) ON DELETE RESTRICT,
  UNIQUE KEY bf_object_column_uq (business_object_id,physical_column_id), KEY bf_model_idx (model_id), KEY bf_object_idx (business_object_id)
);

CREATE TABLE IF NOT EXISTS business_relationships (
  id varchar(36) PRIMARY KEY, model_id varchar(36) NOT NULL, data_source_id varchar(36) NOT NULL, source_object_id varchar(36) NOT NULL, source_field_id varchar(36) NOT NULL, target_object_id varchar(36) NOT NULL, target_field_id varchar(36) NOT NULL,
  join_type enum('INNER','LEFT','RIGHT') NOT NULL DEFAULT 'LEFT', cardinality enum('ONE_TO_ONE','ONE_TO_MANY','MANY_TO_ONE','MANY_TO_MANY','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN', direction enum('BIDIRECTIONAL','SOURCE_TO_TARGET','TARGET_TO_SOURCE') NOT NULL DEFAULT 'SOURCE_TO_TARGET',
  is_required boolean NOT NULL DEFAULT false, confidence_score int NOT NULL DEFAULT 100, source_type enum('DATABASE_CONSTRAINT','AI_SUGGESTED','MANUAL','COLUMN_PATTERN') NOT NULL DEFAULT 'MANUAL', validation_status enum('PENDING','VALID','WARNING','INVALID') NOT NULL DEFAULT 'PENDING', approval_status enum('DRAFT','SUGGESTED','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  approved_by varchar(36), approved_at datetime(3), notes text, version int NOT NULL DEFAULT 1, created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT br_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT br_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  CONSTRAINT br_so_fk FOREIGN KEY (source_object_id) REFERENCES business_objects(id) ON DELETE RESTRICT,
  CONSTRAINT br_sf_fk FOREIGN KEY (source_field_id) REFERENCES business_fields(id) ON DELETE RESTRICT,
  CONSTRAINT br_to_fk FOREIGN KEY (target_object_id) REFERENCES business_objects(id) ON DELETE RESTRICT,
  CONSTRAINT br_tf_fk FOREIGN KEY (target_field_id) REFERENCES business_fields(id) ON DELETE RESTRICT,
  KEY br_model_idx (model_id), KEY br_source_object_idx (source_object_id), KEY br_target_object_idx (target_object_id)
);

CREATE TABLE IF NOT EXISTS business_relationship_validation_results (
  id varchar(36) PRIMARY KEY, relationship_id varchar(36) NOT NULL, model_id varchar(36) NOT NULL, data_source_id varchar(36) NOT NULL,
  result enum('PASSED','PASSED_WITH_WARNING','FAILED') NOT NULL, rule_code varchar(80) NOT NULL, severity enum('INFO','WARNING','ERROR') NOT NULL, message text NOT NULL, suggested_fix text, metrics longtext,
  validated_by varchar(36) NOT NULL, validated_at datetime(3) NOT NULL, version int NOT NULL DEFAULT 1, created_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT brvr_rel_fk FOREIGN KEY (relationship_id) REFERENCES business_relationships(id) ON DELETE RESTRICT,
  CONSTRAINT brvr_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT brvr_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  KEY brvr_rel_idx (relationship_id), KEY brvr_model_idx (model_id)
);

CREATE TABLE IF NOT EXISTS kpi_definitions (
  id varchar(36) PRIMARY KEY, business_context_model_id varchar(36) NOT NULL, data_source_id varchar(36) NOT NULL, business_domain_id varchar(36), code varchar(80) NOT NULL, name varchar(255) NOT NULL, short_name varchar(120), description text, business_objective text, business_question text, owner varchar(190), data_steward varchar(190), tags longtext,
  measure_type enum('ADDITIVE','SEMI_ADDITIVE','NON_ADDITIVE','RATIO','COUNT') NOT NULL DEFAULT 'ADDITIVE', formula_ast longtext NOT NULL, numerator_definition text, denominator_definition text, aggregation varchar(40), distinct_rule text,
  null_handling enum('ZERO','IGNORE','ERROR') NOT NULL DEFAULT 'IGNORE', division_by_zero_handling enum('NULL','ZERO','ERROR') NOT NULL DEFAULT 'NULL', decimal_precision int NOT NULL DEFAULT 2, unit varchar(80), currency varchar(12), percentage_format varchar(80),
  default_date_field_id varchar(36), date_logic longtext, data_freshness_requirement varchar(160), recommended_visualization varchar(80), target_direction enum('HIGHER_IS_BETTER','LOWER_IS_BETTER','TARGET_RANGE'), target_value varchar(100), good_range longtext, bad_range longtext, display_format varchar(120), default_comparison_period varchar(80),
  status enum('DRAFT','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','CERTIFIED','DEPRECATED','ARCHIVED') NOT NULL DEFAULT 'DRAFT', certification_status enum('UNVERIFIED','TECHNICALLY_VALIDATED','BUSINESS_VALIDATED','CERTIFIED') NOT NULL DEFAULT 'UNVERIFIED',
  drafted_by varchar(36) NOT NULL, reviewed_by varchar(36), approved_by varchar(36), approval_date datetime(3), version int NOT NULL DEFAULT 1, effective_date datetime(3), expiry_date datetime(3), change_reason text,
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT kd_model_fk FOREIGN KEY (business_context_model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT kd_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  CONSTRAINT kd_domain_fk FOREIGN KEY (business_domain_id) REFERENCES business_domains(id) ON DELETE SET NULL,
  CONSTRAINT kd_date_field_fk FOREIGN KEY (default_date_field_id) REFERENCES business_fields(id) ON DELETE SET NULL,
  UNIQUE KEY kd_model_code_uq (business_context_model_id,code), KEY kd_model_idx (business_context_model_id), KEY kd_status_idx (status)
);

CREATE TABLE IF NOT EXISTS kpi_formula_nodes (
  id varchar(36) PRIMARY KEY, kpi_id varchar(36) NOT NULL, parent_node_id varchar(36), node_type varchar(40) NOT NULL, operator varchar(40), business_field_id varchar(36), literal_value longtext, config longtext, sort_order int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1, created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT kfn_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT kfn_field_fk FOREIGN KEY (business_field_id) REFERENCES business_fields(id) ON DELETE RESTRICT,
  KEY kfn_kpi_idx (kpi_id), KEY kfn_parent_idx (parent_node_id)
);

CREATE TABLE IF NOT EXISTS kpi_source_fields (
  id varchar(36) PRIMARY KEY, kpi_id varchar(36) NOT NULL, business_object_id varchar(36) NOT NULL, business_field_id varchar(36) NOT NULL, role enum('MEASURE','DIMENSION','FILTER','DATE','JOIN') NOT NULL,
  version int NOT NULL DEFAULT 1, created_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT ksf_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT ksf_object_fk FOREIGN KEY (business_object_id) REFERENCES business_objects(id) ON DELETE RESTRICT,
  CONSTRAINT ksf_field_fk FOREIGN KEY (business_field_id) REFERENCES business_fields(id) ON DELETE RESTRICT,
  UNIQUE KEY ksf_uq (kpi_id,business_field_id,role), KEY ksf_kpi_idx (kpi_id)
);

CREATE TABLE IF NOT EXISTS kpi_filters (
  id varchar(36) PRIMARY KEY, kpi_id varchar(36) NOT NULL, business_field_id varchar(36) NOT NULL, operator varchar(32) NOT NULL, `values` longtext, is_required boolean NOT NULL DEFAULT false, is_exclusion boolean NOT NULL DEFAULT false, sort_order int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1, created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT kf_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT kf_field_fk FOREIGN KEY (business_field_id) REFERENCES business_fields(id) ON DELETE RESTRICT,
  KEY kf_kpi_idx (kpi_id)
);

CREATE TABLE IF NOT EXISTS kpi_thresholds (
  id varchar(36) PRIMARY KEY, kpi_id varchar(36) NOT NULL, threshold_type enum('TARGET','WARNING','CRITICAL','GOOD_RANGE','BAD_RANGE') NOT NULL, operator varchar(24), `value` varchar(100), lower_value varchar(100), upper_value varchar(100),
  version int NOT NULL DEFAULT 1, created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT kt_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT, KEY kt_kpi_idx (kpi_id)
);

CREATE TABLE IF NOT EXISTS kpi_validation_results (
  id varchar(36) PRIMARY KEY, kpi_id varchar(36) NOT NULL, result enum('PASSED','PASSED_WITH_WARNING','FAILED') NOT NULL, rule_code varchar(80) NOT NULL, severity enum('INFO','WARNING','ERROR') NOT NULL, message text NOT NULL, business_object_id varchar(36), business_field_id varchar(36), suggested_fix text,
  validated_by varchar(36) NOT NULL, validated_at datetime(3) NOT NULL, version int NOT NULL DEFAULT 1, created_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT kvr_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT kvr_object_fk FOREIGN KEY (business_object_id) REFERENCES business_objects(id) ON DELETE SET NULL,
  CONSTRAINT kvr_field_fk FOREIGN KEY (business_field_id) REFERENCES business_fields(id) ON DELETE SET NULL,
  KEY kvr_kpi_idx (kpi_id), KEY kvr_rule_idx (rule_code)
);

CREATE TABLE IF NOT EXISTS kpi_test_cases (
  id varchar(36) PRIMARY KEY, kpi_id varchar(36) NOT NULL, name varchar(190) NOT NULL, input_filters longtext, expected_result varchar(255), tolerance varchar(100), technical_validation_notes text, business_validation_notes text,
  status enum('DRAFT','ACTIVE','ARCHIVED') NOT NULL DEFAULT 'DRAFT', version int NOT NULL DEFAULT 1, created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT ktc_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT, KEY ktc_kpi_idx (kpi_id)
);

CREATE TABLE IF NOT EXISTS kpi_test_results (
  id varchar(36) PRIMARY KEY, test_case_id varchar(36), kpi_id varchar(36) NOT NULL, input_filters longtext, expected_result varchar(255), actual_result varchar(255), difference varchar(255), tolerance varchar(100), status enum('PASSED','FAILED','ERROR','CANCELLED') NOT NULL,
  generated_sql longtext, row_count int NOT NULL DEFAULT 0, result_preview longtext, duration_ms int, error_detail text, tested_by varchar(36) NOT NULL, tested_at datetime(3) NOT NULL, version int NOT NULL DEFAULT 1, created_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT ktr_case_fk FOREIGN KEY (test_case_id) REFERENCES kpi_test_cases(id) ON DELETE RESTRICT,
  CONSTRAINT ktr_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  KEY ktr_kpi_idx (kpi_id), KEY ktr_case_idx (test_case_id)
);

CREATE TABLE IF NOT EXISTS business_glossary_terms (
  id varchar(36) PRIMARY KEY, model_id varchar(36), data_source_id varchar(36), business_domain_id varchar(36), business_object_id varchar(36), business_field_id varchar(36), kpi_id varchar(36), term varchar(160) NOT NULL, definition text NOT NULL, abbreviations longtext,
  language enum('EN','TH') NOT NULL DEFAULT 'EN', approval_status enum('DRAFT','SUGGESTED','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT', version int NOT NULL DEFAULT 1,
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bgt_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT bgt_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  CONSTRAINT bgt_domain_fk FOREIGN KEY (business_domain_id) REFERENCES business_domains(id) ON DELETE SET NULL,
  CONSTRAINT bgt_object_fk FOREIGN KEY (business_object_id) REFERENCES business_objects(id) ON DELETE SET NULL,
  CONSTRAINT bgt_field_fk FOREIGN KEY (business_field_id) REFERENCES business_fields(id) ON DELETE SET NULL,
  CONSTRAINT bgt_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE SET NULL,
  KEY bgt_model_idx (model_id), KEY bgt_term_idx (term)
);

CREATE TABLE IF NOT EXISTS business_synonyms (
  id varchar(36) PRIMARY KEY, glossary_term_id varchar(36), business_object_id varchar(36), business_field_id varchar(36), kpi_id varchar(36), synonym varchar(160) NOT NULL, language enum('EN','TH') NOT NULL DEFAULT 'EN', normalized_value varchar(190) NOT NULL,
  status enum('DRAFT','SUGGESTED','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT', version int NOT NULL DEFAULT 1, created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bs_term_fk FOREIGN KEY (glossary_term_id) REFERENCES business_glossary_terms(id) ON DELETE RESTRICT,
  CONSTRAINT bs_object_fk FOREIGN KEY (business_object_id) REFERENCES business_objects(id) ON DELETE RESTRICT,
  CONSTRAINT bs_field_fk FOREIGN KEY (business_field_id) REFERENCES business_fields(id) ON DELETE RESTRICT,
  CONSTRAINT bs_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  KEY bs_normalized_idx (normalized_value), KEY bs_term_idx (glossary_term_id)
);

CREATE TABLE IF NOT EXISTS business_context_model_versions (
  id varchar(36) PRIMARY KEY, model_id varchar(36) NOT NULL, parent_version_id varchar(36), version_number int NOT NULL, change_summary text,
  status enum('DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED','SUPERSEDED') NOT NULL DEFAULT 'DRAFT', objects_snapshot longtext NOT NULL, fields_snapshot longtext NOT NULL, relationships_snapshot longtext NOT NULL, kpis_snapshot longtext NOT NULL, glossary_snapshot longtext NOT NULL,
  reviewed_by varchar(36), approved_by varchar(36), published_by varchar(36), published_at datetime(3), created_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bcmv_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT bcmv_parent_fk FOREIGN KEY (parent_version_id) REFERENCES business_context_model_versions(id) ON DELETE RESTRICT,
  UNIQUE KEY bcmv_uq (model_id,version_number), KEY bcmv_model_idx (model_id)
);

CREATE TABLE IF NOT EXISTS ai_business_context_analysis_jobs (
  id varchar(36) PRIMARY KEY, model_id varchar(36) NOT NULL, data_source_id varchar(36) NOT NULL, status enum('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED', provider varchar(80) NOT NULL, prompt_version varchar(40) NOT NULL, input_hash varchar(64) NOT NULL, progress_step varchar(120), recommendation_count int NOT NULL DEFAULT 0,
  input_token_count int NOT NULL DEFAULT 0, output_token_count int NOT NULL DEFAULT 0, retry_count int NOT NULL DEFAULT 0, redacted_input longtext, error_summary text, started_by varchar(36) NOT NULL, started_at datetime(3) NOT NULL, completed_at datetime(3),
  version int NOT NULL DEFAULT 1, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT aibcaj_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT aibcaj_source_fk FOREIGN KEY (data_source_id) REFERENCES data_sources(id) ON DELETE RESTRICT,
  KEY aibcaj_model_idx (model_id), KEY aibcaj_started_idx (started_at)
);

CREATE TABLE IF NOT EXISTS ai_business_context_recommendations (
  id varchar(36) PRIMARY KEY, model_id varchar(36) NOT NULL, job_id varchar(36) NOT NULL,
  recommendation_type enum('OBJECT_NAME','OBJECT_DESCRIPTION','BUSINESS_DOMAIN','RECORD_GRAIN','FIELD_NAME','BUSINESS_TYPE','FIELD_ROLE','AGGREGATION','RELATIONSHIP','SYNONYM','POTENTIAL_KPI','IGNORE_OBJECT','SENSITIVE_FIELD') NOT NULL,
  target_type enum('MODEL','OBJECT','FIELD','RELATIONSHIP','KPI') NOT NULL, target_id varchar(36), current_value longtext, suggested_value longtext NOT NULL, reason text NOT NULL, confidence_score int NOT NULL, evidence longtext, impact enum('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
  status enum('PENDING','ACCEPTED','REJECTED','MODIFIED','SUPERSEDED') NOT NULL DEFAULT 'PENDING', reviewed_by varchar(36), reviewed_at datetime(3), version int NOT NULL DEFAULT 1,
  created_by varchar(36) NOT NULL, updated_by varchar(36) NOT NULL, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT aibcr_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT aibcr_job_fk FOREIGN KEY (job_id) REFERENCES ai_business_context_analysis_jobs(id) ON DELETE RESTRICT,
  KEY aibcr_model_idx (model_id), KEY aibcr_status_idx (status)
);

CREATE TABLE IF NOT EXISTS business_context_review_requests (
  id varchar(36) PRIMARY KEY, model_id varchar(36) NOT NULL, model_version_id varchar(36), kpi_id varchar(36), review_stage enum('DATA_STEWARD_REVIEW','TECHNICAL_VALIDATION','BUSINESS_OWNER_REVIEW') NOT NULL,
  status enum('OPEN','APPROVED','REJECTED','CHANGES_REQUESTED','CANCELLED') NOT NULL DEFAULT 'OPEN', requested_by varchar(36) NOT NULL, assigned_to varchar(36), requested_at datetime(3) NOT NULL, completed_at datetime(3),
  version int NOT NULL DEFAULT 1, created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bcrr_model_fk FOREIGN KEY (model_id) REFERENCES business_context_models(id) ON DELETE RESTRICT,
  CONSTRAINT bcrr_version_fk FOREIGN KEY (model_version_id) REFERENCES business_context_model_versions(id) ON DELETE RESTRICT,
  CONSTRAINT bcrr_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  KEY bcrr_model_idx (model_id), KEY bcrr_status_idx (status)
);

CREATE TABLE IF NOT EXISTS business_context_review_actions (
  id varchar(36) PRIMARY KEY, review_request_id varchar(36) NOT NULL, action enum('APPROVE','REJECT','REQUEST_CHANGES','COMMENT') NOT NULL, comment text, changed_fields longtext, model_version int NOT NULL, reviewer_id varchar(36) NOT NULL, action_at datetime(3) NOT NULL,
  version int NOT NULL DEFAULT 1, created_at datetime(3) NOT NULL, deleted_at datetime(3),
  CONSTRAINT bcra_request_fk FOREIGN KEY (review_request_id) REFERENCES business_context_review_requests(id) ON DELETE RESTRICT,
  KEY bcra_request_idx (review_request_id), KEY bcra_reviewer_idx (reviewer_id)
);
