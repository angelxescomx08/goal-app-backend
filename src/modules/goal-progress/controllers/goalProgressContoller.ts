import { Context } from 'elysia';
import { CreateGoalProgress, UpdateGoalProgress } from '../schemas/goalProgressSchema';
import { db } from '../../../db/db';
import { goalProgress, goals, userStats } from '../../../db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { updateParentGoalProgress } from '../../goals/utils/updateParentGoalProgress';
import { nowUTC } from '../../../lib/dateUtils';
import crypto from 'node:crypto';

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

export async function listGoalProgress(context: {
  query: { goalId: string },
  status: Context["status"]
}) {
  const { query, status } = context;
  try {
    const records = await db
      .select()
      .from(goalProgress)
      .where(eq(goalProgress.goalId, query.goalId))
      .orderBy(desc(goalProgress.createdAt));
    return status(200, { goalProgress: records });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la obtención del progreso" });
  }
}

export async function deleteGoalProgress(context: {
  id: string,
  status: Context["status"]
}) {
  const { id, status } = context;
  try {
    const [record] = await db
      .select({ goalId: goalProgress.goalId, progress: goalProgress.progress })
      .from(goalProgress)
      .where(eq(goalProgress.id, id))
      .limit(1);
    if (!record?.goalId) return status(404, { error: "Progreso no encontrado" });

    const [goal] = await db
      .select({
        goalType: goals.goalType,
        target: goals.target,
        completedAt: goals.completedAt,
        parentGoalId: goals.parentGoalId,
      })
      .from(goals)
      .where(eq(goals.id, record.goalId))
      .limit(1);
    if (!goal) return status(404, { error: "Meta no encontrada" });

    await db.delete(goalProgress).where(eq(goalProgress.id, id));

    if (goal.goalType === "target") {
      const [{ newProgress }] = await db
        .select({ newProgress: sql<number>`COALESCE(SUM(${goalProgress.progress}), 0)::real` })
        .from(goalProgress)
        .where(eq(goalProgress.goalId, record.goalId));

      const stillComplete = newProgress >= (goal.target ?? 0);
      await db.update(goals).set({
        currentProgress: newProgress,
        completedAt: stillComplete ? goal.completedAt : null,
      }).where(eq(goals.id, record.goalId));

      if (goal.parentGoalId) await updateParentGoalProgress(goal.parentGoalId);
    }

    return status(200, { message: "Progreso eliminado" });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la eliminación del progreso" });
  }
}

export async function updateGoalProgress(context: {
  id: string,
  body: UpdateGoalProgress,
  status: Context["status"]
}) {
  const { id, body, status } = context;
  try {
    const [record] = await db
      .select({ goalId: goalProgress.goalId })
      .from(goalProgress)
      .where(eq(goalProgress.id, id))
      .limit(1);
    if (!record?.goalId) return status(404, { error: "Progreso no encontrado" });

    const [goal] = await db
      .select({
        goalType: goals.goalType,
        target: goals.target,
        completedAt: goals.completedAt,
        parentGoalId: goals.parentGoalId,
      })
      .from(goals)
      .where(eq(goals.id, record.goalId))
      .limit(1);
    if (!goal) return status(404, { error: "Meta no encontrada" });
    if (goal.goalType !== "target")
      return status(400, { error: "Solo se puede modificar el progreso de metas de tipo target" });

    await db.update(goalProgress).set({ progress: body.progress }).where(eq(goalProgress.id, id));

    const [{ newProgress }] = await db
      .select({ newProgress: sql<number>`COALESCE(SUM(${goalProgress.progress}), 0)::real` })
      .from(goalProgress)
      .where(eq(goalProgress.goalId, record.goalId));

    const nowComplete = newProgress >= (goal.target ?? 0);
    await db.update(goals).set({
      currentProgress: newProgress,
      completedAt: nowComplete ? (goal.completedAt ?? nowUTC()) : null,
    }).where(eq(goals.id, record.goalId));

    if (goal.parentGoalId) await updateParentGoalProgress(goal.parentGoalId);

    return status(200, { message: "Progreso actualizado" });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la actualización del progreso" });
  }
}