import { Context } from 'elysia';
import { CreateGoalProgress } from '../schemas/goalProgressSchema';
import { db } from '../../../db/db';
import { goalProgress, goals } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export async function createGoalProgress(context: {
  body: CreateGoalProgress,
  status: Context["status"]
}) {
  const { body, status } = context;
  try {
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, body.goalId),
    });
    if (!goal) {
      return status(404, { error: "Meta no encontrada" });
    }
    const newGoalProgress = await db.insert(goalProgress).values({
      id: crypto.randomUUID(),
      goalId: body.goalId,
      progress: goal.goalType === "target" ? body.progress : null,
    }).returning();
    return status(201, { goalProgress: newGoalProgress });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la creación del progreso de la meta" });
  }
}