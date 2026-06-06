DROP INDEX "idx_goal_progress_goal_id_created_at";--> statement-breakpoint
CREATE INDEX "idx_goals_user_id_pending" ON "goals" USING btree ("user_id","created_at") WHERE "goals"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_goals_user_id_root" ON "goals" USING btree ("user_id","created_at") WHERE "goals"."parent_goal_id" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_goal_progress_goal_id_created_at" ON "goal_progress" USING btree ("goal_id","created_at","progress");