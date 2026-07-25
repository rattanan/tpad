CREATE TABLE IF NOT EXISTS kpi_definition_versions (
  id varchar(36) PRIMARY KEY,
  kpi_id varchar(36) NOT NULL,
  version_number int NOT NULL,
  status enum('APPROVED','CERTIFIED','SUPERSEDED') NOT NULL,
  snapshot_json longtext NOT NULL,
  change_reason text,
  approved_by varchar(36),
  approved_at datetime(3),
  created_by varchar(36) NOT NULL,
  created_at datetime(3) NOT NULL,
  CONSTRAINT kpi_definition_versions_kpi_fk FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
  UNIQUE KEY kpi_definition_versions_uq (kpi_id, version_number),
  KEY kpi_definition_versions_kpi_idx (kpi_id)
);
