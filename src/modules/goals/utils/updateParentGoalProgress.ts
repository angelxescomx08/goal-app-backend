import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../db/db";
import { goals, userStats } from "../../../db/schema";
import { nowUTC } from "../../../lib/dateUtils";

export async function updateParentGoalProgress(parentGoalId: string) {
  const childGoals = await db
    .select({ completedAt: goals.completedAt })
    .from(goals)
    .where(eq(goals.parentGoalId, parentGoalId));

  const completedCount = childGoals.filter(g => g.completedAt !== null).length;
  const currentProgress = completedCount / childGoals.length;
  let completed = null;
  if (currentProgress >= 1) {
    completed = nowUTC();
  }

  const [updatedParentGoal] = await db.update(goals).set({
    currentProgress: currentProgress,
    completedAt: completed,
    target: childGoals.length,
  }).where(eq(goals.id, parentGoalId)).returning();

  if (completed) {
    if (updatedParentGoal?.unitIdCompleted && updatedParentGoal.unitCompletedAmount) {
      await db.insert(userStats).values({
        id: crypto.randomUUID(),
        userId: updatedParentGoal.userId,
        unitId: updatedParentGoal.unitIdCompleted,
        value: updatedParentGoal.unitCompletedAmount,
      });
    }
    if (!updatedParentGoal?.parentGoalId) return;
    await updateParentGoalProgress(updatedParentGoal.parentGoalId);
  }
}