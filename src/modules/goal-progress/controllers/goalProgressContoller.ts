import { Context } from 'elysia';
import { CreateGoalProgress } from '../schemas/goalProgressSchema';
import { db } from '../../../db/db';
import { goalProgress, goals, userStats } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { updateParentGoalProgress } from '../../goals/utils/updateParentGoalProgress';
import { nowUTC } from '../../../lib/dateUtils';
import crypto from 'node:crypto';

/**
 * IMPORTANTE: Todas las fechas se manejan en UTC
 * - completedAt se crea usando nowUTC() para garantizar UTC
 */
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
        // IMPORTANTE: Usar nowUTC() para obtener fecha actual en UTC
        completed = nowUTC();
      }
      await db.update(goals).set({
        currentProgress: newProgress,
        completedAt: completed,
      }).where(eq(goals.id, body.goalId));
      await db.insert(userStats).values({
        id: crypto.randomUUID(),
        userId: goal.userId,
        unitId: goal.unitId,
        value: body.progress ?? 0,
      });
      if (completed && goal.unitIdCompleted && goal.unitCompletedAmount) {
        await db.insert(userStats).values({
          id: crypto.randomUUID(),
          userId: goal.userId,
          unitId: goal.unitIdCompleted,
          value: goal.unitCompletedAmount,
        });
      }
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