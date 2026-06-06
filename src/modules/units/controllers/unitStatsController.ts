import { db } from "../../../db/db";
import { goalProgress, goals, units } from "../../../db/schema";
import { Session } from "../../../lib/auth";
import { Context } from "elysia";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { UnitStatsQuery } from "../schemas/unitStatsSchema";

export async function getUnitStatistics(context: {
  session: Session["session"],
  query: UnitStatsQuery,
  status: Context["status"]
}) {
  const { session, query, status } = context;

  try {
    // Verificar que la unidad existe
    const unit = await db.query.units.findFirst({
      where: eq(units.id, query.unitId),
    });

    if (!unit) {
      return status(404, { error: "Unidad no encontrada" });
    }

    const startUtc = query.startUtc;
    const endUtc = query.endUtc;

    const progressOverTimeQuery = await db
      .select({
        date: sql<string>`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')::text`.as('date'),
        value: sql<number>`COALESCE(SUM(${goalProgress.progress}), 0)`.as('value'),
      })
      .from(goalProgress)
      .innerJoin(goals, eq(goalProgress.goalId, goals.id))
      .where(
        and(
          eq(goals.unitId, query.unitId),
          gte(goalProgress.createdAt, startUtc),
          lte(goalProgress.createdAt, endUtc)
        )
      )
      .groupBy(sql`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')`);

    const cumulativeData: Array<{ date: string; total: number }> = [];
    let cumulativeTotal = 0;

    for (const row of progressOverTimeQuery) {
      cumulativeTotal += row.value;
      cumulativeData.push({
        date: row.date,
        total: cumulativeTotal,
      });
    }

    const activityCountQuery = await db
      .select({
        date: sql<string>`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')::text`.as('date'),
        count: sql<number>`COUNT(*)::int`.as('count'),
      })
      .from(goalProgress)
      .innerJoin(goals, eq(goalProgress.goalId, goals.id))
      .where(
        and(
          eq(goals.unitId, query.unitId),
          gte(goalProgress.createdAt, startUtc),
          lte(goalProgress.createdAt, endUtc)
        )
      )
      .groupBy(sql`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`DATE(${goalProgress.createdAt} AT TIME ZONE 'UTC')`);

    const progressByGoalQuery = await db
      .select({
        goalId: goals.id,
        goalTitle: goals.title,
        totalProgress: sql<number>`COALESCE(SUM(${goalProgress.progress}), 0)`.as('totalProgress'),
      })
      .from(goalProgress)
      .innerJoin(goals, eq(goalProgress.goalId, goals.id))
      .where(
        and(
          eq(goals.unitId, query.unitId),
          gte(goalProgress.createdAt, startUtc),
          lte(goalProgress.createdAt, endUtc)
        )
      )
      .groupBy(goals.id, goals.title)
      .orderBy(sql`COALESCE(SUM(${goalProgress.progress}), 0) DESC`);

    const progressOverTime = progressOverTimeQuery.map(row => ({
      date: row.date,
      value: Number(row.value),
    }));

    const activityCount = activityCountQuery.map(row => ({
      date: row.date,
      count: Number(row.count),
    }));

    const progressByGoal = progressByGoalQuery.map(row => ({
      goalId: row.goalId,
      goalTitle: row.goalTitle,
      totalProgress: Number(row.totalProgress),
    }));

    return status(200, {
      unitId: query.unitId,
      range: {
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString(),
      },
      charts: {
        progressOverTime,
        cumulativeProgress: cumulativeData,
        activityCount,
        progressByGoal,
      },
    });
  } catch (error) {
    console.error("Error al obtener estadísticas de unidad:", error);
    return status(500, { error: "Falló la obtención de las estadísticas de la unidad" });
  }
}
