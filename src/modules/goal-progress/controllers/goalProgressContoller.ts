import { Context } from 'elysia';
import { CreateGoalProgress } from '../schemas/goalProgressSchema';
import { db } from '../../../db/db';
import { goalProgress, goals } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { updateParentGoalProgress } from '../../goals/utils/updateParentGoalProgress';

export async function createGoalProgress(context: {
  body: CreateGoalProgress,
  status: Context["status"]
}) {
  const { body, status } = context;
  try {
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, body.goalId),
    });
    if (!goal) return status(404, { error: "Meta no encontrada" });
    if (goal.goalType === "goals") return status(400, {
      error: "No se puede crear progreso para esta meta"
    });

    const newGoalProgress = await db.insert(goalProgress).values({
      id: crypto.randomUUID(),
      goalId: body.goalId,
      progress: goal.goalType === "target" ? body.progress : null,
    }).returning();

    if (goal.goalType === "target") {
      const newProgress = (goal.currentProgress ?? 0) + (body.progress ?? 0)
      let completed = null;
      if (newProgress >= (goal.target ?? 0)) {
        completed = new Date();
      }
      await db.update(goals).set({
        currentProgress: newProgress,
        completedAt: completed,
      }).where(eq(goals.id, body.goalId));
      if (goal.parentGoalId) {
        await updateParentGoalProgress(goal.parentGoalId);
      }
    }

    return status(201, { goalProgress: newGoalProgress });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la creación del progreso de la meta" });
  }
}