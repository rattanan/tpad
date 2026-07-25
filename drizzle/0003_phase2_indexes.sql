CREATE TABLE IF NOT EXISTS `data_source_indexes` (
  `id` varchar(36) NOT NULL, `table_id` varchar(36) NOT NULL, `index_name` varchar(128) NOT NULL, `column_name` varchar(128) NOT NULL, `column_position` int NOT NULL, `is_unique` boolean NOT NULL DEFAULT false, `status` enum('ACTIVE','MISSING','ARCHIVED') NOT NULL DEFAULT 'ACTIVE', `created_at` datetime(3) NOT NULL, `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `data_source_indexes_uq` (`table_id`,`index_name`,`column_name`), KEY `data_source_indexes_table_idx` (`table_id`), CONSTRAINT `data_source_indexes_table_fk` FOREIGN KEY (`table_id`) REFERENCES `data_source_tables` (`id`) ON DELETE CASCADE
);
