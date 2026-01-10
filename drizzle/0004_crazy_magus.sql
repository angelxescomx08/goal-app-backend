ALTER TABLE "goals" DROP CONSTRAINT "goals_unit_id_units_id_fk";
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;