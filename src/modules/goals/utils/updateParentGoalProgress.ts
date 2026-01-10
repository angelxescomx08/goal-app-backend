import { eq } from "drizzle-orm";
import { db } from "../../../db/db";
import { goals } from "../../../db/schema";

export async function updateParentGoalProgress(parentGoalId: string) {
  const childGoals = await db.query.goals.findMany({
    where: eq(goals.parentGoalId, parentGoalId),
  });

  const completedChildGoals = childGoals.filter((goal) => goal.completedAt !== null);
  const currentProgress = completedChildGoals.length / childGoals.length;
  let completed = null;
  if (currentProgress >= 1) {
    completed = new Date();
  }

  await db.update(goals).set({
    currentProgress: currentProgress,
    completedAt: completed,
    target: childGoals.length,
  }).where(eq(goals.id, parentGoalId));

  if (completed) {
    const parentGoal = await db.query.goals.findFirst({
      where: eq(goals.id, parentGoalId),
    });
    if (!parentGoal) return;
    if (!parentGoal.parentGoalId) return;
    await updateParentGoalProgress(parentGoal.parentGoalId);
  }
}