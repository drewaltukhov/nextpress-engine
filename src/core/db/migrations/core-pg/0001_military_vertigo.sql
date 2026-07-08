CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_origins" jsonb,
	"rate_limit_per_minute" integer,
	"expires_at" text,
	"last_used_at" text,
	"last_used_ip" text,
	"revoked_at" text,
	"revoked_by" text,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "galleries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_media_id" text,
	"item_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"gallery_id" integer NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	"caption" text,
	CONSTRAINT "gallery_items_gallery_id_media_id_pk" PRIMARY KEY("gallery_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"actor_user_id" text,
	"actor_token_id" integer,
	"session_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"diff" jsonb,
	"diff_size_bytes" integer,
	"diff_truncated" boolean DEFAULT false NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failed_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text NOT NULL,
	"error_stack" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"next_retry_at" text,
	"resolved_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failed_logins" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"email" text,
	"ip_address" text NOT NULL,
	"reason" text NOT NULL,
	"geo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"plugin_slug" text NOT NULL,
	"phase" text NOT NULL,
	"hook_name" text,
	"error_message" text NOT NULL,
	"error_class" text,
	"error_stack" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_failures_phase_check" CHECK ("plugin_failures"."phase" IN ('boot','migrate','register','hook','route'))
);
--> statement-breakpoint
CREATE TABLE "system_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"event" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_log_level_check" CHECK ("system_log"."level" IN ('debug','info','warn','error'))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt_text" text,
	"blob_data" "bytea",
	"thumb_data" "bytea",
	"thumb_mime" text,
	"storage_backend" text DEFAULT 'db' NOT NULL,
	"storage_ref" text NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_id" integer NOT NULL,
	"parent_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"item_type" text NOT NULL,
	"reference_id" integer,
	"url" text,
	"target" text DEFAULT '_self' NOT NULL,
	"css_classes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content_json" text,
	"excerpt" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" text,
	"seo_title" text,
	"seo_description" text,
	"seo_og_image" text,
	"seo_canonical" text,
	"seo_robots" text DEFAULT 'index,follow' NOT NULL,
	"seo_exclude_from_sitemap" boolean DEFAULT false NOT NULL,
	"schema_types" text DEFAULT '[]' NOT NULL,
	"trashed_at" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template" text
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content_json" text,
	"excerpt" text,
	"featured_image" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" text,
	"post_kind" text DEFAULT 'standalone' NOT NULL,
	"parent_id" integer,
	"seo_title" text,
	"seo_description" text,
	"seo_og_image" text,
	"seo_canonical" text,
	"seo_robots" text DEFAULT 'index,follow' NOT NULL,
	"seo_exclude_from_sitemap" boolean DEFAULT false NOT NULL,
	"schema_types" text DEFAULT '[]' NOT NULL,
	"trashed_at" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template" text
);
--> statement-breakpoint
CREATE TABLE "posts_topics" (
	"post_id" integer NOT NULL,
	"topic_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_topics_post_id_topic_id_pk" PRIMARY KEY("post_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status" integer DEFAULT 301 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"last_hit_at" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" text,
	"notes" text,
	CONSTRAINT "redirects_status_check" CHECK ("redirects"."status" IN (301, 302, 307, 308, 410)),
	CONSTRAINT "redirects_source_check" CHECK ("redirects"."source" IN ('manual','permalink_change','slug_change','media_rename'))
);
--> statement-breakpoint
CREATE TABLE "allowed_ips" (
	"ip_cidr" text NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"label" text NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowed_ips_ip_cidr_tenant_id_pk" PRIMARY KEY("ip_cidr","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "blocked_ips" (
	"ip_address" text NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"blocked_until" text,
	"blocked_by" text,
	"attempt_count" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_ips_ip_address_tenant_id_pk" PRIMARY KEY("ip_address","tenant_id"),
	CONSTRAINT "blocked_ips_reason_check" CHECK ("blocked_ips"."reason" IN ('auto:brute_force','auto:scanner','manual','admin_blocked'))
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"autoload" boolean DEFAULT false NOT NULL,
	"scope" text DEFAULT 'private' NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_tenant_id_key_pk" PRIMARY KEY("tenant_id","key"),
	CONSTRAINT "site_settings_scope_check" CHECK ("site_settings"."scope" IN ('public','private'))
);
--> statement-breakpoint
CREATE TABLE "theme_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_slug" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"puck_data" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"parent_template" text,
	"display_name" text
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"post_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" text,
	"display_name" text NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"bio" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"last_login_at" text,
	"lockout_until" text,
	"lockout_attempt_count" integer DEFAULT 0 NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('active','invited','disabled'))
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"algo" text DEFAULT 'argon2id' NOT NULL,
	"must_reset" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_oauth_accounts" (
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_oauth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "user_email_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" text NOT NULL,
	"consumed_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_tokens_purpose_check" CHECK ("user_email_tokens"."purpose" IN ('verify_email','reset_password','invite'))
);
--> statement-breakpoint
CREATE TABLE "session_revocations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "session_revocations_reason_check" CHECK ("session_revocations"."reason" IN ('password_change','admin_disabled','suspicious_activity','manual','role_demotion'))
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"slug" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"session_max_age_days" integer,
	"require_step_up" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role_slug" text NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_roles_user_id_role_slug_tenant_id_pk" PRIMARY KEY("user_id","role_slug","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "reserved_slugs" (
	"slug" text NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"reason" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reserved_slugs_tenant_id_slug_pk" PRIMARY KEY("tenant_id","slug")
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_gallery_id_galleries_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts_topics" ADD CONSTRAINT "posts_topics_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts_topics" ADD CONSTRAINT "posts_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowed_ips" ADD CONSTRAINT "allowed_ips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_ips" ADD CONSTRAINT "blocked_ips_blocked_by_users_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_tokens" ADD CONSTRAINT "user_email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_revocations" ADD CONSTRAINT "session_revocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_slug_roles_slug_fk" FOREIGN KEY ("role_slug") REFERENCES "public"."roles"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_unique" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_active_idx" ON "api_tokens" USING btree ("token_hash") WHERE "api_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "api_tokens_user_idx" ON "api_tokens" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "galleries_slug_unique" ON "galleries" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "galleries_updated_idx" ON "galleries" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE INDEX "gallery_items_position_idx" ON "gallery_items" USING btree ("gallery_id","position");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("tenant_id","actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("tenant_id","action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_session_idx" ON "audit_log" USING btree ("session_id","created_at") WHERE "audit_log"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_log_token_idx" ON "audit_log" USING btree ("actor_token_id","created_at") WHERE "audit_log"."actor_token_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "failed_jobs_pending_idx" ON "failed_jobs" USING btree ("next_retry_at") WHERE "failed_jobs"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "failed_logins_ip_idx" ON "failed_logins" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "failed_logins_email_idx" ON "failed_logins" USING btree ("email","created_at") WHERE "failed_logins"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "plugin_failures_recent_idx" ON "plugin_failures" USING btree ("plugin_slug","created_at");--> statement-breakpoint
CREATE INDEX "system_log_recent_idx" ON "system_log" USING btree ("tenant_id","level","created_at");--> statement-breakpoint
CREATE INDEX "system_log_source_idx" ON "system_log" USING btree ("source","created_at");--> statement-breakpoint
CREATE INDEX "system_log_trace_idx" ON "system_log" USING btree ("trace_id") WHERE "system_log"."trace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "media_tenant_uploaded_idx" ON "media" USING btree ("tenant_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "menu_items_menu_idx" ON "menu_items" USING btree ("menu_id","position");--> statement-breakpoint
CREATE INDEX "menu_items_parent_idx" ON "menu_items" USING btree ("parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "menus_slug_unique" ON "menus" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "menus_location_idx" ON "menus" USING btree ("tenant_id","location");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_unique" ON "pages" USING btree ("tenant_id","slug") WHERE "pages"."trashed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "pages_status_updated_idx" ON "pages" USING btree ("tenant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "pages_author_idx" ON "pages" USING btree ("tenant_id","created_by");--> statement-breakpoint
CREATE INDEX "pages_trashed_idx" ON "pages" USING btree ("tenant_id","trashed_at") WHERE "pages"."trashed_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_root_unique" ON "posts" USING btree ("tenant_id","slug") WHERE "posts"."trashed_at" IS NULL AND "posts"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_child_unique" ON "posts" USING btree ("tenant_id","parent_id","slug") WHERE "posts"."trashed_at" IS NULL AND "posts"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "posts_status_updated_idx" ON "posts" USING btree ("tenant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("tenant_id","created_by");--> statement-breakpoint
CREATE INDEX "posts_parent_idx" ON "posts" USING btree ("tenant_id","parent_id") WHERE "posts"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "posts_kind_idx" ON "posts" USING btree ("tenant_id","post_kind","status","updated_at");--> statement-breakpoint
CREATE INDEX "posts_trashed_idx" ON "posts" USING btree ("tenant_id","trashed_at") WHERE "posts"."trashed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "posts_topics_topic_idx" ON "posts_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "redirects_path_unique" ON "redirects" USING btree ("tenant_id","from_path");--> statement-breakpoint
CREATE INDEX "redirects_active_idx" ON "redirects" USING btree ("tenant_id","from_path") WHERE "redirects"."active" = true;--> statement-breakpoint
CREATE INDEX "blocked_ips_active_idx" ON "blocked_ips" USING btree ("tenant_id","ip_address");--> statement-breakpoint
CREATE INDEX "site_settings_autoload_idx" ON "site_settings" USING btree ("tenant_id") WHERE "site_settings"."autoload" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "theme_data_slug_kind_name_unique" ON "theme_data" USING btree ("theme_slug","kind","name");--> statement-breakpoint
CREATE INDEX "theme_data_theme_parent_idx" ON "theme_data" USING btree ("theme_slug","parent_template");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_slug_unique" ON "topics" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "topics_name_idx" ON "topics" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_active_email_unique" ON "users" USING btree ("tenant_id","email") WHERE "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "users_locked_idx" ON "users" USING btree ("lockout_until") WHERE "users"."lockout_until" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_oauth_accounts_user_idx" ON "user_oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_email_tokens_user_idx" ON "user_email_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_email_tokens_expires_idx" ON "user_email_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_slug");--> statement-breakpoint
CREATE INDEX "user_roles_tenant_user_idx" ON "user_roles" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "reserved_slugs_source_idx" ON "reserved_slugs" USING btree ("source");