CREATE INDEX "idx_goal_progress_goal_id_created_at" ON "goal_progress" USING btree ("goal_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_goals_user_id_created_at" ON "goals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_goals_user_id_goal_type" ON "goals" USING btree ("user_id","goal_type");--> statement-breakpoint
CREATE INDEX "idx_goals_parent_goal_id" ON "goals" USING btree ("parent_goal_id");--> statement-breakpoint
CREATE INDEX "idx_goals_unit_id" ON "goals" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_user_stats_user_id_created_at" ON "user_stats" USING btree ("user_id","created_at");