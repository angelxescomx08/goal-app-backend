import { Session } from "../../../lib/auth";
import { db } from "../../../db/db";
import { goalProgress, goals, userStats } from '../../../db/schema';
import { and, eq, gte, lte, or, ilike, isNull, isNotNull } from "drizzle-orm";
import { CreateGoalSchema } from '../schemas/goalSchema';
import { Context, } from "elysia";
import crypto from "node:crypto";
import { Pagination } from "../../../types/pagination";
import { updateParentGoalProgress } from "../utils/updateParentGoalProgress";
import { formatUTCToDay, nowUTC } from "../../../lib/dateUtils";

/**
 * CONTRATO DE FECHAS:
 * - El frontend envía fechas YA convertidas a UTC en formato ISO 8601 UTC
 * - startDate y endDate son Date objects parseados desde ISO 8601 UTC
 * - Se usan DIRECTAMENTE en consultas sin conversiones
 * - No se hacen ajustes ni reinterpretaciones
 */
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
      const parentGoal = await db.query.goals.findFirst({
        where: eq(goals.id, body.parentGoalId),
      });
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

/**
 * CONTRATO DE FECHAS:
 * - El frontend envía fechas YA convertidas a UTC en formato ISO 8601 UTC
 * - startDate y endDate son Date objects parseados desde ISO 8601 UTC
 * - Se usan DIRECTAMENTE en consultas sin conversiones
 * - No se hacen ajustes ni reinterpretaciones
 */
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
    // Usar fechas directamente sin conversiones
    // El frontend ya las envió en UTC correcto
    const goalsByUser = await db.query.goals.findMany({
      where: and(
        eq(goals.userId, user.id),
        gte(goals.createdAt, query.startDate), // UTC directo
        lte(goals.createdAt, query.endDate)),  // UTC directo
    });

    const totalGoals = goalsByUser.length;
    const totalCompletedGoals = goalsByUser.filter((goal) => goal.completedAt !== null).length;

    return status(200, {
      totalGoals,
      totalCompletedGoals,
      pendingGoals: totalGoals - totalCompletedGoals,
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
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, id),
    });
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
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, id),
    });
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

export async function goalStatistics(context: {
  id: string,
  user: Session["user"],
  status: Context["status"]
}) {
  const { id, status, user } = context;
  try {
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, id),
    });
    if (!goal) return status(404, { error: "Meta no encontrada" });
    let historicalData: { date: string, progress: number }[] = [];

    if (goal.goalType === "target") {
      const goalProgressRecords = await db.query.goalProgress.findMany({
        where: eq(goalProgress.goalId, goal.id),
      });

      const dates = new Map<string, number>();

      // IMPORTANTE: Usar dayjs.utc() para formatear fechas en UTC
      // Esto asegura que el día se extraiga correctamente sin considerar zona local
      for (const record of goalProgressRecords) {
        const date = formatUTCToDay(record.createdAt); // Formatea en UTC
        if (!dates.has(date)) {
          dates.set(date, record.progress ?? 0);
        } else {
          const prev = dates.get(date) ?? 0;
          const inc = record.progress ?? 0;
          dates.set(date, prev + inc);
        }
      }
      for (const [date, progress] of dates.entries()) {
        historicalData.push({
          date,
          progress,
        });
      }
    }

    return status(200, {
      historicalData,
    });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la obtención de las estadísticas de la meta" });
  }
}