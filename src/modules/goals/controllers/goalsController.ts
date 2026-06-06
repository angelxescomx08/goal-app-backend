import { Session } from "../../../lib/auth";
import { db } from "../../../db/db";
import { goalProgress, goals, userStats } from '../../../db/schema';
import { and, eq, gte, lte, or, ilike, isNull, isNotNull, sql } from "drizzle-orm";
import { CreateGoalSchema } from '../schemas/goalSchema';
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

    // Each subquery groups progress by period then averages those period totals.
    // All use the covering index (goalId, createdAt, progress) → index-only scans.
    const weeklySubq = db
      .select({ total: sql<number>`SUM(${goalProgress.progress})`.as('total') })
      .from(goalProgress)
      .where(and(
        eq(goalProgress.goalId, id),
        sql`${goalProgress.createdAt} >= NOW() AT TIME ZONE 'UTC' - INTERVAL '1 month'`,
      ))
      .groupBy(sql`DATE_TRUNC('week', ${goalProgress.createdAt} AT TIME ZONE 'UTC')`)
      .as('w');

    const monthlySubq = db
      .select({ total: sql<number>`SUM(${goalProgress.progress})`.as('total') })
      .from(goalProgress)
      .where(and(
        eq(goalProgress.goalId, id),
        sql`${goalProgress.createdAt} >= NOW() AT TIME ZONE 'UTC' - INTERVAL '4 months'`,
      ))
      .groupBy(sql`DATE_TRUNC('month', ${goalProgress.createdAt} AT TIME ZONE 'UTC')`)
      .as('m');

    const yearlySubq = db
      .select({ total: sql<number>`SUM(${goalProgress.progress})`.as('total') })
      .from(goalProgress)
      .where(and(
        eq(goalProgress.goalId, id),
        sql`${goalProgress.createdAt} >= NOW() AT TIME ZONE 'UTC' - INTERVAL '4 years'`,
      ))
      .groupBy(sql`DATE_TRUNC('year', ${goalProgress.createdAt} AT TIME ZONE 'UTC')`)
      .as('y');

    const [[weekly], [monthly], [yearly]] = await Promise.all([
      db.select({ avg: sql<number>`COALESCE(AVG(${weeklySubq.total}), 0)::real` }).from(weeklySubq),
      db.select({ avg: sql<number>`COALESCE(AVG(${monthlySubq.total}), 0)::real` }).from(monthlySubq),
      db.select({ avg: sql<number>`COALESCE(AVG(${yearlySubq.total}), 0)::real` }).from(yearlySubq),
    ]);

    let daysLeft: number | null = null;
    let estimatedDate: string | null = null;

    if (goal.completedAt) {
      daysLeft = 0;
      estimatedDate = goal.completedAt.toISOString();
    } else {
      // Prefer monthly rate for projection; fall back to weekly if no monthly data
      const dailyRate = monthly.avg > 0 ? monthly.avg / 30 : weekly.avg / 7;
      if (dailyRate > 0) {
        daysLeft = Math.ceil(remaining / dailyRate);
        estimatedDate = new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return status(200, {
      target,
      currentProgress: current,
      remaining,
      averages: {
        weekly: round2(weekly.avg),
        monthly: round2(monthly.avg),
        yearly: round2(yearly.avg),
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