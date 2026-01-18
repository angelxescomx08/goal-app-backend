import { eq } from "drizzle-orm";
import { db } from "../../../db/db";
import { goals, userStats } from "../../../db/schema";
import { nowUTC } from "../../../lib/dateUtils";

/**
 * IMPORTANTE: Todas las fechas se manejan en UTC
 * - completedAt se crea usando nowUTC() para garantizar UTC
 */
export async function updateParentGoalProgress(parentGoalId: string) {
  const childGoals = await db.query.goals.findMany({
    where: eq(goals.parentGoalId, parentGoalId),
  });

  const completedChildGoals = childGoals.filter((goal) => goal.completedAt !== null);
  const currentProgress = completedChildGoals.length / childGoals.length;
  let completed = null;
  if (currentProgress >= 1) {
    // IMPORTANTE: Usar nowUTC() para obtener fecha actual en UTC
    completed = nowUTC();
  }

  const [updatedParentGoal] = await db.update(goals).set({
    currentProgress: currentProgress,
    completedAt: completed,
    target: childGoals.length,
  }).where(eq(goals.id, parentGoalId)).returning();

  if (completed) {
    const parentGoal = await db.query.goals.findFirst({
      where: eq(goals.id, parentGoalId),
    });
    if (parentGoal && updatedParentGoal.unitIdCompleted && updatedParentGoal.unitCompletedAmount) {
      await db.insert(userStats).values({
        id: crypto.randomUUID(),
        userId: updatedParentGoal.userId,
        unitId: updatedParentGoal.unitIdCompleted,
        value: updatedParentGoal.unitCompletedAmount,
      });
    }
    if (!parentGoal) return;
    if (!parentGoal.parentGoalId) return;
    await updateParentGoalProgress(parentGoal.parentGoalId);
  }
}