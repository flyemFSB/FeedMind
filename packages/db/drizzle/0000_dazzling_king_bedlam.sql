CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"agent_message_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_chat_messages_session_agent_id" UNIQUE("session_id","agent_message_id"),
	CONSTRAINT "ck_chat_messages_role" CHECK ("chat_messages"."role" in ('user', 'assistant', 'system', 'tool')),
	CONSTRAINT "ck_chat_messages_status" CHECK ("chat_messages"."status" in ('streaming', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_thread_id" text NOT NULL,
	"title" text DEFAULT '新会话' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_sessions_agent_thread_id_unique" UNIQUE("agent_thread_id")
);
--> statement-breakpoint
CREATE TABLE "llm" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model_name" text NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"encrypted_api_key" text DEFAULT '' NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_model_name_unique" UNIQUE("model_name")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_messages_session_created_at" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_updated_at" ON "chat_sessions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_pinned_updated_at" ON "chat_sessions" USING btree ("pinned","updated_at");