CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'bank' NOT NULL,
	`bank_name` text,
	`last4` text,
	`currency` text DEFAULT 'INR' NOT NULL,
	`latest_balance_minor` integer,
	`latest_balance_at` integer,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_accounts_bank_last4` ON `accounts` (`bank_name`,`last4`) WHERE "accounts"."last4" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_system` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_categories_name_kind` ON `categories` (`name`,`kind`);--> statement-breakpoint
CREATE TABLE `merchant_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`match_key` text NOT NULL,
	`direction` text NOT NULL,
	`category_id` integer NOT NULL,
	`auto_confirm` integer DEFAULT 0 NOT NULL,
	`hit_count` integer DEFAULT 1 NOT NULL,
	`last_used_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_rules_match` ON `merchant_rules` (`match_type`,`match_key`,`direction`);--> statement-breakpoint
CREATE TABLE `sms_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sms_hash` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`received_at` integer NOT NULL,
	`parse_status` text NOT NULL,
	`template_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_messages_sms_hash_unique` ON `sms_messages` (`sms_hash`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`category_id` integer,
	`direction` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`occurred_at` integer NOT NULL,
	`local_date` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`counterparty_name` text,
	`counterparty_key` text,
	`channel` text,
	`reference` text,
	`description` text,
	`note` text,
	`balance_after_minor` integer,
	`source` text NOT NULL,
	`sms_message_id` integer,
	`dedupe_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sms_message_id`) REFERENCES `sms_messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_txn_amount_positive" CHECK("transactions"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_dedupe_key_unique` ON `transactions` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `ix_txn_status_date` ON `transactions` (`status`,`local_date`);--> statement-breakpoint
CREATE INDEX `ix_txn_category_date` ON `transactions` (`category_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `ix_txn_account_date` ON `transactions` (`account_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `ix_txn_cpkey` ON `transactions` (`counterparty_key`);