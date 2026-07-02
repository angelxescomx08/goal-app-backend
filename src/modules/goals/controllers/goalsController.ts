import { Session } from "../../../lib/auth";
import { db } from "../../../db/db";
import { goalProgress, goals, userStats } from '../../../db/schema';
import { and, eq, gte, lte, or, ilike, isNull, isNotNull, sql } from "drizzle-orm";
import { CreateGoalSchema, UpdateGoalSchema } from '../schemas/goalSchema';
import { Context } from "elysia";
import crypto from "node:crypto";
import { Pagination } from "../../../types/pagination";
import { updateParentGoalProgress } from "../utils/updateParentGoalProgress";
import { nowUTC } from "../../../lib/dateUtils";

export async function getGoalsByUser(context: {
  session: Session["session"],
  query: Pagination & {
    startDate: Date;
    endDate: Date;
    search?: string;
    completed?: boolean;
    goalType?: "target" | "manual" | "goals";
    excludeChildGoals?: boolean;
  },
  status: Context["status"]
}) {
  const { session, query, status } = context;

  const conditions = [
    eq(goals.userId, session.userId),
    gte(goals.createdAt, query.startDate),
    lte(goals.createdAt, query.endDate),
  ];

  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    conditions.push(or(
      ilike(goals.title, term),
      ilike(goals.description, term),
    )!);
  }
  if (query.completed === true) {
    conditions.push(isNotNull(goals.completedAt));
  } else if (query.completed === false) {
    conditions.push(isNull(goals.completedAt));
  }
  if (query.goalType) {
    conditions.push(eq(goals.goalType, query.goalType));
  }
  if (query.excludeChildGoals === true) {
    conditions.push(isNull(goals.parentGoalId));
  }

  const userGoals = await db
    .select()
    .from(goals)
    .where(and(...conditions))
    .limit(query.limit + 1)
    .offset((query.page - 1) * query.limit);
  const hasMore = userGoals.length > query.limit;
  const data = userGoals.slice(0, query.limit);
  return status(200, {
    data,
    total: userGoals.length,
    page: query.page,
    limit: query.limit,
    hasMore,
  });
}

export async function createGoal(context: {
  body: CreateGoalSchema,
  session: Session["session"],
  user: Session["user"],
  status: Context["status"]
}) {
  const { body, user, status } = context;
  try {

    if (body.parentGoalId) {
      const [parentGoal] = await db
        .select({ goalType: goals.goalType })
        .from(goals)
        .where(eq(goals.id, body.parentGoalId))
        .limit(1);
      if (!parentGoal)
        return status(404, { error: "Meta padre no encontrada" });
      if (parentGoal.goalType !== "goals")
        return status(400, { error: "La meta padre no permite crear metas hijas" });
    }

    const newGoal = await db.insert(goals).values({
      id: crypto.randomUUID(),
      userId: user.id,
      title: body.title,
      goalType: body.goalType,
      description: body.description,
      parentGoalId: body.parentGoalId,
      unitId: body.unitId,
      target: body.target,
      unitIdCompleted: body.unitIdCompleted,
      unitCompletedAmount: body.unitCompletedAmount,
    }).returning();

    if (body.parentGoalId) {
      await updateParentGoalProgress(body.parentGoalId);
    }

    return status(201, { goal: newGoal });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la creación de la meta" });
  }

}

export async function getGoalById(context: {
  id: string,
  status: Context["status"]
}) {
  const { id, status } = context;
  const goal = await db.query.goals.findFirst({
    where: eq(goals.id, id),
    with: {
      units: true,
      parentGoal: true,
    },
  });
  if (goal?.goalType === "goals") {
    return status(200, {
      ...goal,
      children: await db.query.goals.findMany({
        where: eq(goals.parentGoalId, goal.id),
      }),
    });
  }
  return status(200, goal);
}

export async function updateGoal(context: {
  id: string,
  body: UpdateGoalSchema,
  session: Session["session"],
  status: Context["status"]
}) {
  const { id, body, session, status } = context;
  try {
    const [goal] = await db
      .select()
      .from(goals)
      .where(eq(goals.id, id))
      .limit(1);
    if (!goal) return status(404, { error: "Meta no encontrada" });
    if (goal.userId !== session.userId) return status(404, { error: "Meta no encontrada" });

    const nextGoalType = body.goalType ?? goal.goalType;
    const nextUnitId = body.unitId !== undefined ? body.unitId : goal.unitId;
    const nextTarget = body.target !== undefined ? body.target : goal.target;

    if (nextGoalType === "target" && (!nextUnitId || !nextTarget)) {
      return status(400, { error: "La unidad y el objetivo son requeridos cuando el tipo es target" });
    }

    if (goal.goalType === "goals" && nextGoalType !== "goals") {
      const [childGoal] = await db
        .select({ id: goals.id })
        .from(goals)
        .where(eq(goals.parentGoalId, id))
        .limit(1);
      if (childGoal)
        return status(400, { error: "No se puede cambiar el tipo de una meta contenedora que tiene metas hijas" });
    }

    let nextParentGoalId = goal.parentGoalId;
    if (body.parentGoalId !== undefined) {
      nextParentGoalId = body.parentGoalId;

      if (nextParentGoalId) {
        if (nextParentGoalId === id)
          return status(400, { error: "Una meta no puede ser su propia meta padre" });

        const [newParent] = await db
          .select({ goalType: goals.goalType, parentGoalId: goals.parentGoalId })
          .from(goals)
          .where(eq(goals.id, nextParentGoalId))
          .limit(1);
        if (!newParent) return status(404, { error: "Meta padre no encontrada" });
        if (newParent.goalType !== "goals")
          return status(400, { error: "La meta padre no permite crear metas hijas" });

        // Evitar ciclos: subir por los ancestros del nuevo padre y verificar que nunca se llegue a esta meta
        let cursor = newParent.parentGoalId;
        while (cursor) {
          if (cursor === id)
            return status(400, { error: "No se puede asignar una meta padre que crearía un ciclo" });
          const [ancestor] = await db
            .select({ parentGoalId: goals.parentGoalId })
            .from(goals)
            .where(eq(goals.id, cursor))
            .limit(1);
          cursor = ancestor?.parentGoalId ?? null;
        }
      }
    }

    const oldParentGoalId = goal.parentGoalId;

    const [updatedGoal] = await db.update(goals).set({
      ...body,
      ...(body.parentGoalId !== undefined ? { parentGoalId: nextParentGoalId } : {}),
    }).where(eq(goals.id, id)).returning();

    if (oldParentGoalId && oldParentGoalId !== nextParentGoalId) {
      await updateParentGoalProgress(oldParentGoalId);
    }
    if (nextParentGoalId) {
      await updateParentGoalProgress(nextParentGoalId);
    }

    return status(200, { goal: updatedGoal });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la actualización de la meta" });
  }
}

export async function getStatistics(context: {
  session: Session["session"],
  user: Session["user"],
  query: {
    startDate: Date, // ISO 8601 UTC parseado
    endDate: Date,   // ISO 8601 UTC parseado
  },
  status: Context["status"]
}) {
  const { session, user, status, query } = context;

  try {
    const [result] = await db
      .select({
        totalGoals: sql<number>`count(*)::int`,
        totalCompletedGoals: sql<number>`count(*) filter (where ${goals.completedAt} is not null)::int`,
      })
      .from(goals)
      .where(and(
        eq(goals.userId, user.id),
        gte(goals.createdAt, query.startDate),
        lte(goals.createdAt, query.endDate),
      ));

    return status(200, {
      totalGoals: result.totalGoals,
      totalCompletedGoals: result.totalCompletedGoals,
      pendingGoals: result.totalGoals - result.totalCompletedGoals,
    });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la obtención de las estadísticas" });
  }
}

export async function toggleGoalCompletion(context: {
  id: string,
  status: Context["status"]
}) {
  const { id, status } = context;
  try {
    const [goal] = await db
      .select({
        goalType: goals.goalType,
        completedAt: goals.completedAt,
        userId: goals.userId,
        unitIdCompleted: goals.unitIdCompleted,
        unitCompletedAmount: goals.unitCompletedAmount,
        parentGoalId: goals.parentGoalId,
      })
      .from(goals)
      .where(eq(goals.id, id))
      .limit(1);
    if (!goal) return status(404, { error: "Meta no encontrada" });
    if (goal.completedAt) return status(400, { error: "La meta ya está completada" });
    if (goal.goalType !== "manual")
      return status(400, { error: "No se puede marcar como completada una meta que no sea manual" });
    await db.update(goals).set({ completedAt: nowUTC() }).where(eq(goals.id, id));
    if (goal.unitIdCompleted && goal.unitCompletedAmount) {
      await db.insert(userStats).values({
        id: crypto.randomUUID(),
        userId: goal.userId,
        unitId: goal.unitIdCompleted,
        value: goal.unitCompletedAmount,
      });
    }
    if (goal.parentGoalId) await updateParentGoalProgress(goal.parentGoalId);
    return status(200, { message: "Meta marcada como completada" });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la marca de la meta como completada" });
  }
}

export async function getGoalsWithTypeGoal(context: {
  session: Session["session"],
  user: Session["user"],
  status: Context["status"]
}) {
  const { user, status } = context;
  try {
    const goalsWithTypeGoal = await db.query.goals.findMany({
      where: and(
        eq(goals.userId, user.id),
        eq(goals.goalType, "goals"),
      ),
    });
    return status(200, goalsWithTypeGoal);
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la obtención de las metas con tipo goal" });
  }
}

export async function deleteGoal(context: {
  id: string,
  status: Context["status"]
}) {
  const { id, status } = context;
  try {
    const [goal] = await db
      .select({ parentGoalId: goals.parentGoalId })
      .from(goals)
      .where(eq(goals.id, id))
      .limit(1);
    if (!goal) return status(404, { error: "Meta no encontrada" });

    const deletedGoal = await db.delete(goals).where(eq(goals.id, id));

    if (goal.parentGoalId) {
      await updateParentGoalProgress(goal.parentGoalId);
    }

    return status(200, { message: "Meta eliminada", goal: deletedGoal });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la eliminación de la meta" });
  }
}

export async function getGoalProjection(context: {
  id: string,
  status: Context["status"]
}) {
  const { id, status } = context;
  try {
    const [goal] = await db
      .select({
        goalType: goals.goalType,
        target: goals.target,
        currentProgress: goals.currentProgress,
        completedAt: goals.completedAt,
      })
      .from(goals)
      .where(eq(goals.id, id))
      .limit(1);

    if (!goal) return status(404, { error: "Meta no encontrada" });
    if (goal.goalType !== "target")
      return status(400, { error: "La proyección solo aplica a metas de tipo target" });

    const target = goal.target ?? 0;
    const current = goal.currentProgress ?? 0;
    const remaining = Math.max(target - current, 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    if (goal.completedAt) {
      return status(200, {
        target,
        currentProgress: current,
        remaining: 0,
        averages: { weekly: 0, monthly: 0, yearly: 0 },
        projection: {
          daysLeft: 0,
          estimatedDate: goal.completedAt.toISOString(),
        },
      });
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const oneWeekAgo = new Date(now - 7 * dayMs);
    const oneMonthAgo = new Date(now - 30 * dayMs);
    const oneYearAgo = new Date(now - 365 * dayMs);

    // OPTIMIZACIÓN EXTREMA: Agregación Condicional.
    // 1 sola consulta a la base de datos, 1 solo escaneo de índice.
    const [stats] = await db
      .select({
        weekly: sql<number>`COALESCE(SUM(CASE WHEN ${goalProgress.createdAt} >= ${oneWeekAgo} THEN ${goalProgress.progress} ELSE 0 END), 0)::real`,
        monthly: sql<number>`COALESCE(SUM(CASE WHEN ${goalProgress.createdAt} >= ${oneMonthAgo} THEN ${goalProgress.progress} ELSE 0 END), 0)::real`,
        yearly: sql<number>`COALESCE(SUM(${goalProgress.progress}), 0)::real` // Aquí sumamos todo porque el WHERE ya filtra al último año
      })
      .from(goalProgress)
      .where(and(
        eq(goalProgress.goalId, id),
        gte(goalProgress.createdAt, oneYearAgo) // Escaneamos únicamente los registros del último año hacia acá
      ));

    let daysLeft: number | null = null;
    let estimatedDate: string | null = null;

    // Al no haber subconsultas, stats ya trae directamente los totales de cada periodo
    const dailyRate = stats.monthly > 0 ? stats.monthly / 30 : stats.weekly / 7;

    if (dailyRate > 0) {
      daysLeft = Math.ceil(remaining / dailyRate);
      estimatedDate = new Date(now + daysLeft * dayMs).toISOString();
    }

    return status(200, {
      target,
      currentProgress: current,
      remaining,
      averages: {
        weekly: round2(stats.weekly),
        monthly: round2(stats.monthly),
        yearly: round2(stats.yearly),
      },
      projection: {
        daysLeft,
        estimatedDate,
      },
    });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la proyección de la meta" });
  }
}

export async function getGoalStreak(context: {
  id: string,
  status: Context["status"]
}) {
  const { id, status } = context;
  try {
    const [goal] = await db
      .select({ goalType: goals.goalType })
      .from(goals)
      .where(eq(goals.id, id))
      .limit(1);

    if (!goal) return status(404, { error: "Meta no encontrada" });
    if (goal.goalType !== "manual")
      return status(400, { error: "La racha solo aplica a metas de tipo manual" });

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    // Gaps-and-islands: agrupa los días consecutivos con registro de actividad en 1 sola consulta
    const result = await db.execute<{
      total_days: number;
      max_streak: number;
      average_streak: number | string;
    }>(sql`
      WITH days AS (
        SELECT DISTINCT DATE(created_at AT TIME ZONE 'UTC') AS day
        FROM goal_progress
        WHERE goal_id = ${id} AND created_at >= ${oneYearAgo}
      ),
      grouped AS (
        SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int AS grp
        FROM days
      ),
      streaks AS (
        SELECT COUNT(*)::int AS streak_length
        FROM grouped
        GROUP BY grp
      )
      SELECT
        (SELECT COUNT(*) FROM days)::int AS total_days,
        COALESCE(MAX(streak_length), 0)::int AS max_streak,
        COALESCE(ROUND(AVG(streak_length)::numeric, 2), 0) AS average_streak
      FROM streaks
    `);

    const row = result.rows[0] ?? { total_days: 0, max_streak: 0, average_streak: 0 };

    const dailyActivity = await db
      .select({
        date: sql<string>`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(goalProgress)
      .where(and(
        eq(goalProgress.goalId, id),
        gte(goalProgress.createdAt, oneYearAgo),
      ))
      .groupBy(sql`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')`);

    return status(200, {
      totalDays: Number(row.total_days),
      maxStreak: Number(row.max_streak),
      averageStreak: Number(row.average_streak),
      dailyActivity,
    });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la obtención de la racha de la meta" });
  }
}

export async function goalStatistics(context: {
  id: string,
  user: Session["user"],
  status: Context["status"]
}) {
  const { id, status, user } = context;
  try {
    const [goal] = await db
      .select({ goalType: goals.goalType })
      .from(goals)
      .where(eq(goals.id, id))
      .limit(1);
    if (!goal) return status(404, { error: "Meta no encontrada" });
    let historicalData: { date: string, progress: number }[] = [];

    if (goal.goalType === "target") {
      historicalData = await db
        .select({
          date: sql<string>`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')::text`,
          progress: sql<number>`COALESCE(SUM(${goalProgress.progress}), 0)::real`,
        })
        .from(goalProgress)
        .where(eq(goalProgress.goalId, id))
        .groupBy(sql`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')`)
        .orderBy(sql`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')`);
    }

    return status(200, {
      historicalData,
    });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la obtención de las estadísticas de la meta" });
  }
}
