CREATE TABLE "plan_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"title" text NOT NULL,
	"skills" text[] NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_certificates_planId_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
ALTER TABLE "plan_certificates" ADD CONSTRAINT "plan_certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_certificates" ADD CONSTRAINT "plan_certificates_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;