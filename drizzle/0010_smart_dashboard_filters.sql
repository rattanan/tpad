ALTER TABLE `dashboard_global_filters`
  ADD COLUMN `configuration_json` LONGTEXT NULL AFTER `applies_to_block_ids_json`;
