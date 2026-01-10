import { Session } from "../../../lib/auth";
import { db } from "../../../db/db";
import { goalProgress, goals } from '../../../db/schema';
import { and, eq, gte, lte } from "drizzle-orm";
import { CreateGoalSchema } from "../schemas/goalSchema";
import { Context, } from "elysia";
import crypto from "node:crypto";
import { Pagination } from "../../../types/pagination";
import { updateParentGoalProgress } from "../utils/updateParentGoalProgress";
import dayjs from "dayjs";

export async function getGoalsByUser(context: {
  session: Session["session"],
  query: Pagination & {
    startDate: string;
    endDate: string;
  },
  status: Context["status"]
}) {
  const { session, query, status } = context;
  const userGoals = await db
    .select()
    .from(goals)
    .where(and(
      eq(goals.userId, session.userId),
      gte(goals.createdAt, new Date(query.startDate)),
      lte(goals.createdAt, new Date(query.endDate)),
    ))
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
  return status(200, goal);
}

export async function getStatistics(context: {
  session: Session["session"],
  user: Session["user"],
  query: {
    startDate: string,
    endDate: string,
  },
  status: Context["status"]
}) {
  const { session, user, status, query } = context;

  try {
    const goalsByUser = await db.query.goals.findMany({
      where: and(
        eq(goals.userId, user.id),
        gte(goals.createdAt, new Date(query.startDate)),
        lte(goals.createdAt, new Date(query.endDate))),
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
    if (goal.goalType !== "manual")
      return status(400, { error: "No se puede marcar como completada una meta que no sea manual" });
    if (goal.completedAt) {
      await db.update(goals).set({ completedAt: null }).where(eq(goals.id, id));
    } else {
      await db.update(goals).set({ completedAt: new Date() }).where(eq(goals.id, id));
    }
    if (goal.parentGoalId) {
      await updateParentGoalProgress(goal.parentGoalId);
    }
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

      for (const record of goalProgressRecords) {
        const date = dayjs(record.createdAt).format("YYYY-MM-DD");
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