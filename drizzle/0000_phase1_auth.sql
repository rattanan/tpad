CREATE TABLE IF NOT EXISTS `users` (
  `id` varchar(36) NOT NULL,
  `full_name` varchar(160) NOT NULL,
  `username` varchar(80) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('ADMIN','DATA_SOURCE_CREATOR','DASHBOARD_CREATOR','VIEWER') NOT NULL DEFAULT 'VIEWER',
  `status` enum('ACTIVE','INACTIVE','LOCKED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `admin_notes` text,
  `failed_login_attempts` int NOT NULL DEFAULT 0,
  `failed_login_window_started_at` datetime(3),
  `locked_until` datetime(3),
  `must_change_password` boolean NOT NULL DEFAULT true,
  `last_login_at` datetime(3),
  `password_changed_at` datetime(3),
  `created_at` datetime(3) NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  `created_by` varchar(36),
  `updated_by` varchar(36),
  `archived_at` datetime(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_uq` (`email`),
  UNIQUE KEY `users_username_uq` (`username`),
  KEY `users_status_idx` (`status`),
  KEY `users_role_idx` (`role`)
);

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `session_token_hash` varchar(64) NOT NULL,
  `ip_address` varchar(64),
  `user_agent` text,
  `last_active_at` datetime(3) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `revoked_at` datetime(3),
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessions_token_uq` (`session_token_hash`),
  KEY `sessions_user_idx` (`user_id`),
  KEY `sessions_expires_idx` (`expires_at`),
  CONSTRAINT `sessions_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `login_history` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36),
  `login_identifier` varchar(190) NOT NULL,
  `event_type` enum('LOGIN','LOGOUT','SESSION') NOT NULL,
  `status` enum('SUCCESS','FAILED','LOCKED','LOGOUT','SESSION_EXPIRED') NOT NULL,
  `ip_address` varchar(64),
  `user_agent` text,
  `browser` varchar(80),
  `operating_system` varchar(80),
  `device_type` varchar(40),
  `failure_reason` varchar(160),
  `logged_in_at` datetime(3),
  `logged_out_at` datetime(3),
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `login_history_user_idx` (`user_id`),
  KEY `login_history_created_idx` (`created_at`),
  KEY `login_history_status_idx` (`status`),
  CONSTRAINT `login_history_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` varchar(36) NOT NULL,
  `actor_user_id` varchar(36),
  `actor_name` varchar(160),
  `action` varchar(100) NOT NULL,
  `category` varchar(60) NOT NULL,
  `target_type` varchar(60),
  `target_id` varchar(80),
  `target_name` varchar(190),
  `result` enum('SUCCESS','FAILED') NOT NULL,
  `description` text,
  `previous_values` longtext,
  `new_values` longtext,
  `ip_address` varchar(64),
  `user_agent` text,
  `request_id` varchar(36) NOT NULL,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `audit_actor_idx` (`actor_user_id`),
  KEY `audit_action_idx` (`action`),
  KEY `audit_target_idx` (`target_type`, `target_id`),
  KEY `audit_created_idx` (`created_at`),
  CONSTRAINT `audit_actor_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `password_history` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `password_history_user_idx` (`user_id`, `created_at`),
  CONSTRAINT `password_history_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `login_rate_limits` (
  `ip_hash` varchar(64) NOT NULL,
  `window_started_at` datetime(3) NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `blocked_until` datetime(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`ip_hash`)
);
