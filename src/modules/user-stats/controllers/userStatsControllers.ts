import { Context } from "elysia";
import { Session } from "../../../lib/auth";
import { UserStatsQuery } from "../schemas/userStatsSchema";
import { db } from "../../../db/db";
import { userStats, units } from "../../../db/schema";
import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";

function calculatePreviousPeriod(
  startDate: Date,
  endDate: Date,
  type: "week" | "month" | "year" | "all"
): { startDate: Date; endDate: Date } | null {
  if (type === "all") {
    return null;
  }

  // Calcular la duración del período actual en milisegundos
  const periodDuration = endDate.getTime() - startDate.getTime();

  // Calcular el período anterior retrocediendo en el tiempo
  // El período anterior termina justo antes de que comience el actual
  const previousEndDate = new Date(startDate.getTime() - 1); // Un milisegundo antes del inicio actual

  // El período anterior tiene la misma duración que el actual
  const previousStartDate = new Date(previousEndDate.getTime() - periodDuration);

  return {
    startDate: previousStartDate,
    endDate: previousEndDate,
  };
}

export async function getUserStats(context: {
  session: Session["session"],
  status: Context["status"],
  query: UserStatsQuery;
}) {
  const { session, status, query } = context;

  try {
    const userId = session.userId;
    const { startDate, endDate, type } = query;

    const currentPeriodStats = await db
      .select({
        unitId: userStats.unitId,
        totalValue: sql<number>`COALESCE(SUM(${userStats.value}), 0)`.as('totalValue'),
      })
      .from(userStats)
      .where(
        and(
          eq(userStats.userId, userId),
          gte(userStats.createdAt, startDate),
          lte(userStats.createdAt, endDate)
        )
      )
      .groupBy(userStats.unitId);

    const previousPeriod = type !== "all"
      ? calculatePreviousPeriod(startDate, endDate, type)
      : null;

    let previousPeriodStats: Array<{ unitId: string | null; totalValue: number }> = [];
    if (previousPeriod) {
      previousPeriodStats = await db
        .select({
          unitId: userStats.unitId,
          totalValue: sql<number>`COALESCE(SUM(${userStats.value}), 0)`.as('totalValue'),
        })
        .from(userStats)
        .where(
          and(
            eq(userStats.userId, userId),
            gte(userStats.createdAt, previousPeriod.startDate),
            lte(userStats.createdAt, previousPeriod.endDate)
          )
        )
        .groupBy(userStats.unitId);
    }

    const allUnitIds = new Set<string>();
    for (const stat of currentPeriodStats) {
      if (stat.unitId) allUnitIds.add(stat.unitId);
    }
    for (const stat of previousPeriodStats) {
      if (stat.unitId) allUnitIds.add(stat.unitId);
    }

    const currentPeriodMap = new Map<string, number>();
    for (const stat of currentPeriodStats) {
      if (stat.unitId) currentPeriodMap.set(stat.unitId, Number(stat.totalValue));
    }

    const previousPeriodMap = new Map<string, number>();
    for (const stat of previousPeriodStats) {
      if (stat.unitId) previousPeriodMap.set(stat.unitId, Number(stat.totalValue));
    }

    const allUnits = allUnitIds.size > 0
      ? await db
        .select()
        .from(units)
        .where(inArray(units.id, Array.from(allUnitIds)))
      : [];

    const unitsMap = new Map(allUnits.map(unit => [unit.id, unit]));

    const stats = Array.from(allUnitIds).map(unitId => {
      const unit = unitsMap.get(unitId);
      if (!unit) return null;

      const currentPeriod = currentPeriodMap.get(unitId) ?? 0;
      const lastPeriod = type === "all" ? 0 : (previousPeriodMap.get(unitId) ?? 0);

      let percentage = 0;
      if (type !== "all" && lastPeriod !== 0) {
        percentage = ((currentPeriod - lastPeriod) / lastPeriod) * 100;
      }
      percentage = Math.round(percentage * 100) / 100;

      return {
        unit,
        percentage,
        currentPeriod,
        lastPeriod,
      };
    }).filter((stat): stat is NonNullable<typeof stat> => stat !== null);

    return status(200, {
      stats,
    });
  } catch (error) {
    console.error("Error al obtener estadísticas del usuario:", error);
    return status(500, { error: "Falló la obtención de las estadísticas del usuario" });
  }
}