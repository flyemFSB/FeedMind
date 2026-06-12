CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_message_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_chat_messages_role" CHECK("chat_messages"."role" in ('user', 'assistant', 'system', 'tool')),
	CONSTRAINT "ck_chat_messages_status" CHECK("chat_messages"."status" in ('streaming', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_session_created_at` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_chat_messages_session_agent_id` ON `chat_messages` (`session_id`,`agent_message_id`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_thread_id` text NOT NULL,
	`title` text DEFAULT '新会话' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_sessions_agent_thread_id_unique` ON `chat_sessions` (`agent_thread_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_updated_at` ON `chat_sessions` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_pinned_updated_at` ON `chat_sessions` (`pinned`,`updated_at`);--> statement-breakpoint
CREATE TABLE `llm` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model_name` text NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`encrypted_api_key` text DEFAULT '' NOT NULL,
	`is_selected` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `llm_model_name_unique` ON `llm` (`model_name`);--> statement-breakpoint
CREATE TABLE `runtime_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scenario` text NOT NULL,
	`llm_id` integer,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`max_tokens` integer DEFAULT 8192 NOT NULL,
	`context_length` text DEFAULT '128k' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`llm_id`) REFERENCES `llm`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runtime_config_scenario_unique` ON `runtime_config` (`scenario`);--> statement-breakpoint
CREATE TABLE `tools` (
	`name` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`icon` text,
	`config_fields` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crawler_contents` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`content_id` text NOT NULL,
	`title` text,
	`desc` text,
	`display_url` text,
	`images` text,
	`video_url` text,
	`video_cover_url` text,
	`author_id` text,
	`author_name` text,
	`author_avatar` text,
	`like_count` integer,
	`collect_count` integer,
	`comment_count` integer,
	`share_count` integer,
	`published_at` text,
	`crawled_at` text DEFAULT (current_timestamp) NOT NULL,
	`task_id` text,
	`raw_json` text,
	`tag` text
);
--> statement-breakpoint
CREATE INDEX `idx_crawler_contents_platform` ON `crawler_contents` (`platform`);--> statement-breakpoint
CREATE INDEX `idx_crawler_contents_task_id` ON `crawler_contents` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_crawler_contents_author_id` ON `crawler_contents` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_crawler_contents_tag` ON `crawler_contents` (`tag`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_crawler_contents_platform_id` ON `crawler_contents` (`content_id`,`platform`);--> statement-breakpoint
CREATE TABLE `crawler_creators` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`creator_id` text NOT NULL,
	`name` text,
	`avatar` text,
	`desc` text,
	`follower_count` integer,
	`following_count` integer,
	`note_count` integer,
	`gender` text,
	`crawled_at` text DEFAULT (current_timestamp) NOT NULL,
	`task_id` text,
	`raw_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_crawler_creators_platform` ON `crawler_creators` (`platform`);--> statement-breakpoint
CREATE INDEX `idx_crawler_creators_task_id` ON `crawler_creators` (`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_crawler_creators_platform_id` ON `crawler_creators` (`creator_id`,`platform`);--> statement-breakpoint
CREATE TABLE `crawler_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`crawler_type` text NOT NULL,
	`keywords` text,
	`specified_urls` text,
	`creator_ids` text,
	`cookies` text,
	`proxy_url` text,
	`max_notes` integer DEFAULT 100 NOT NULL,
	`max_concurrency` integer DEFAULT 5 NOT NULL,
	`enable_media` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0,
	`total` integer DEFAULT 0,
	`error` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_crawler_tasks_platform_status` ON `crawler_tasks` (`platform`,`status`);--> statement-breakpoint
CREATE INDEX `idx_crawler_tasks_created_at` ON `crawler_tasks` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_crawler_tasks_status` ON `crawler_tasks` (`status`);