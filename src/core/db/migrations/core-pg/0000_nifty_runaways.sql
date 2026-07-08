CREATE TABLE "plugins" (
	"slug" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migrations_log" (
	"plugin_slug" text NOT NULL,
	"migration_name" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" text,
	"execution_ms" integer,
	"checksum" text NOT NULL,
	CONSTRAINT "migrations_log_plugin_slug_migration_name_pk" PRIMARY KEY("plugin_slug","migration_name")
);
--> statement-breakpoint
CREATE TABLE "migration_lock" (
	"id" integer PRIMARY KEY NOT NULL,
	"locked_at" timestamp with time zone NOT NULL,
	"owner" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "migrations_log_applied_at_idx" ON "migrations_log" USING btree ("applied_at");--> statement-breakpoint
CREATE VIEW "public"."plugins_public" AS (SELECT slug, version, enabled FROM plugins WHERE enabled = true);