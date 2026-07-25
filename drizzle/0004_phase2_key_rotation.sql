ALTER TABLE `data_sources` ADD COLUMN `password_key_version` varchar(40) NOT NULL DEFAULT 'v1' AFTER `password_auth_tag`;
