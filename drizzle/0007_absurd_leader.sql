ALTER TABLE "goals" ADD COLUMN "unit_id_completed" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "unit_completed_amount" real;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_unit_id_completed_units_id_fk" FOREIGN KEY ("unit_id_completed") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;