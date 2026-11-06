CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`channel` text NOT NULL,
	`kind` text NOT NULL,
	`about` text NOT NULL,
	`summary` text NOT NULL,
	`details` text,
	`tool` text,
	`table_id` text,
	`selection` text,
	`error` text,
	`assistant` text,
	`client_name` text,
	`client_version` text,
	`contact` text,
	`share_with_abs` integer DEFAULT false NOT NULL,
	`run_id` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`admin_note` text,
	`sender_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_time_idx` ON `feedback` (`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_status_idx` ON `feedback` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_sender_idx` ON `feedback` (`sender_hash`,`created_at`);