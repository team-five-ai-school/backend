CREATE TYPE "public"."ai_capability" AS ENUM('auto', 'assist', 'human');--> statement-breakpoint
CREATE TYPE "public"."chaos_type" AS ENUM('scattered_channels', 'manual_transfer', 'repetitive_replies', 'reports', 'status_tracking');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('started', 'described', 'completed', 'claimed');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('template', 'llm', 'user');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."plan_item_status" AS ENUM('slot', 'ready', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'superseded');--> statement-breakpoint
CREATE TABLE "chaos_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid,
	"version" integer NOT NULL,
	"lanes" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"role_slug" text NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"free_text" text,
	"status" "onboarding_status" DEFAULT 'started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_templates" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"quiz" jsonb NOT NULL,
	"default_tasks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_time_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"hours_before" real NOT NULL,
	"hours_after" real NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"chaos_type" "chaos_type" NOT NULL,
	"description" text NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid,
	"title" text NOT NULL,
	"skill_slug" text NOT NULL,
	"chaos_type" "chaos_type" NOT NULL,
	"hours_per_week" real NOT NULL,
	"ai_capability" "ai_capability" NOT NULL,
	"source" "task_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"skill_slugs" text[] DEFAULT '{}'::text[] NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"duration_min" integer NOT NULL,
	"level" "skill_level",
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "learning_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"version" integer NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"skill_slug" text NOT NULL,
	"lesson_id" uuid,
	"status" "plan_item_status" DEFAULT 'slot' NOT NULL,
	"source_task_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"estimated_hours_saved" real NOT NULL,
	"rationale" text
);
--> statement-breakpoint
ALTER TABLE "chaos_maps" ADD CONSTRAINT "chaos_maps_session_id_onboarding_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."onboarding_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chaos_maps" ADD CONSTRAINT "chaos_maps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_role_slug_role_templates_slug_fk" FOREIGN KEY ("role_slug") REFERENCES "public"."role_templates"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_time_logs" ADD CONSTRAINT "routine_time_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_time_logs" ADD CONSTRAINT "routine_time_logs_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_session_id_onboarding_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."onboarding_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "public"."skills"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_session_id_onboarding_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."onboarding_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chaos_maps_session_id_index" ON "chaos_maps" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chaos_maps_user_id_index" ON "chaos_maps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "onboarding_sessions_user_id_index" ON "onboarding_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "routine_time_logs_user_id_index" ON "routine_time_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "work_tasks_session_id_index" ON "work_tasks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "work_tasks_user_id_index" ON "work_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lessons_skill_slugs_gin" ON "lessons" USING gin ("skill_slugs");--> statement-breakpoint
CREATE INDEX "lessons_course_id_index" ON "lessons" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "learning_plans_user_id_index" ON "learning_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "learning_plans_session_id_index" ON "learning_plans" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "plan_items_plan_id_index" ON "plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_items_skill_slug_status_idx" ON "plan_items" USING btree ("skill_slug","status");