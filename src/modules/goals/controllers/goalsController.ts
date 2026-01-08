import { Session } from "../../../lib/auth";
import { db } from "../../../db/db";
import { goals } from '../../../db/schema';
import { and, eq, gte, lte } from "drizzle-orm";
import { CreateGoalSchema } from "../schemas/goalSchema";
import { Context, } from "elysia";
import crypto from "node:crypto";
import { Pagination } from "../../../types/pagination";
import { updateParentGoalProgress } from "../utils/updateParentGoalProgress";

export async function getGoalsByUser(context: {
  session: Session["session"],
  query: Pagination,
  status: Context["status"]
}) {
  const { session, query, status } = context;
  const userGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, session.userId))
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
      if (parentGoal.userId !== user.id)
        return status(403, { error: "No tienes permisos para crear una meta dentro de esta meta" });
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