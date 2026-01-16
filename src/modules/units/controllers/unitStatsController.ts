import { db } from "../../../db/db";
import { goalProgress, goals, units } from "../../../db/schema";
import { Session } from "../../../lib/auth";
import { Context } from "elysia";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { UnitStatsQuery } from "../schemas/unitStatsSchema";

/**
 * Controlador de estadísticas para unidades
 * 
 * CONTRATO DE FECHAS:
 * - El frontend envía fechas YA convertidas a UTC en formato ISO 8601 UTC
 * - startUtc y endUtc son Date objects parseados desde ISO 8601 UTC
 * - Se usan DIRECTAMENTE en consultas sin conversiones
 * - Todas las agregaciones se hacen en UTC
 */

/**
 * Obtiene estadísticas de una unidad en un rango de fechas
 * 
 * Genera datos para:
 * 1. Progreso en el tiempo (line chart) - progreso diario agrupado
 * 2. Progreso acumulado (area/line) - progreso total acumulado
 * 3. Conteo de eventos de progreso - número de registros por día
 * 4. Progreso por goal (bar/stacked bar) - total por goal
 * 5. Distribución temporal - progreso total agrupado por día
 */
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

    // Usar fechas directamente sin conversiones
    // El frontend ya las envió en UTC correcto
    const startUtc = query.startUtc;
    const endUtc = query.endUtc;

    // 1. Progreso en el tiempo (agrupado por día)
    // Agrupa por día en UTC y suma el progreso de todos los goals de la unidad
    // La conexión PostgreSQL está configurada en UTC, así que DATE() extrae correctamente el día en UTC
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

    // 2. Progreso acumulado
    // Calcula el progreso acumulado día a día
    const cumulativeData: Array<{ date: string; total: number }> = [];
    let cumulativeTotal = 0;

    for (const row of progressOverTimeQuery) {
      cumulativeTotal += row.value;
      cumulativeData.push({
        date: row.date,
        total: cumulativeTotal,
      });
    }

    // 3. Conteo de eventos de progreso por día
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

    // 4. Progreso por goal (total acumulado por goal en el rango)
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

    // Formatear fechas para respuesta (asegurar formato YYYY-MM-DD)
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
