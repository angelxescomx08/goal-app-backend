import { Session } from "../../../lib/auth";
import { db } from "../../../db/db";
import { goalProgress, goals } from '../../../db/schema';
import { eq } from "drizzle-orm";
import { CreateGoalSchema } from "../schemas/goalSchema";
import { Context, } from "elysia";
import crypto from "node:crypto";
import { Pagination } from "../../../types/pagination";

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
    const newGoal = await db.insert(goals).values({
      id: crypto.randomUUID(),
      userId: user.id,
      title: body.title,
      goalType: body.goal_type,
      description: body.description,
      parentGoalId: body.parent_goal_id,
      unitId: body.unit_id,
      target: body.target,
    }).returning();

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
      goalProgress: true,
      parentGoal: true,
    },
  });
  return status(200, goal);
}

export async function getGoalProgressByGoalId(context: {
  goalId: string,
  status: Context["status"]
}) {
  const { goalId, status } = context;
  try {
    const [goal, progress] = await Promise.all([
      db.query.goals.findFirst({
        where: eq(goals.id, goalId),
      }),
      db.query.goalProgress.findMany({
        where: eq(goalProgress.goalId, goalId),
      })
    ])
    if (!goal) {
      return status(404, { error: "Meta no encontrada" });
    }

    if (goal.goalType === "target") {
      const totalProgress = progress.reduce((acc, curr) => acc + (curr.progress ?? 0), 0);
      return status(200, {
        progress: goal.target,
        currentProgress: totalProgress,
      });
    }

    if (goal.goalType === "goals") {
      
    }

    return status(200, goalProgress);
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la obtención del progreso de la meta" });
  }
}