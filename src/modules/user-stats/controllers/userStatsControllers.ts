import { Context } from "elysia";
import { Session } from "../../../lib/auth";
import { UserStatsQuery } from "../schemas/userStatsSchema";
import { db } from "../../../db/db";
import { userStats, units } from "../../../db/schema";
import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";

/**
 * CONTRATO DE FECHAS:
 * - El frontend envía fechas YA convertidas a UTC en formato ISO 8601 UTC
 * - startDate y endDate son Date objects parseados desde ISO 8601 UTC
 * - Se usan DIRECTAMENTE en consultas sin conversiones
 * - No se hacen ajustes ni reinterpretaciones
 */

/**
 * Calcula el período anterior basado en el tipo y la duración del período actual
 * El período anterior tiene la misma duración que el actual, solo retrocede en el tiempo
 */
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

    // Usar fechas directamente sin conversiones
    // El frontend ya las envió en UTC correcto

    // Query para período actual: agrupar por unit_id y sumar value
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

    // Calcular período anterior si type !== "all"
    const previousPeriod = type !== "all"
      ? calculatePreviousPeriod(startDate, endDate, type)
      : null;

    // Query para período anterior (si existe)
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

    // Obtener todas las unidades involucradas (de ambos períodos)
    const allUnitIds = new Set<string>();
    currentPeriodStats.forEach(stat => {
      if (stat.unitId) allUnitIds.add(stat.unitId);
    });
    previousPeriodStats.forEach(stat => {
      if (stat.unitId) allUnitIds.add(stat.unitId);
    });

    // Convertir a Mapas para acceso rápido
    const currentPeriodMap = new Map<string, number>();
    currentPeriodStats.forEach(stat => {
      if (stat.unitId) {
        currentPeriodMap.set(stat.unitId, Number(stat.totalValue));
      }
    });

    const previousPeriodMap = new Map<string, number>();
    previousPeriodStats.forEach(stat => {
      if (stat.unitId) {
        previousPeriodMap.set(stat.unitId, Number(stat.totalValue));
      }
    });

    // Obtener todas las unidades involucradas
    const allUnits = allUnitIds.size > 0
      ? await db
        .select()
        .from(units)
        .where(inArray(units.id, Array.from(allUnitIds)))
      : [];

    // Crear mapa de unidades para acceso rápido
    const unitsMap = new Map(allUnits.map(unit => [unit.id, unit]));

    // Construir el array de estadísticas
    const stats = Array.from(allUnitIds).map(unitId => {
      const unit = unitsMap.get(unitId);
      if (!unit) {
        // Si por alguna razón la unidad no existe, la omitimos
        return null;
      }

      const currentPeriod = currentPeriodMap.get(unitId) ?? 0;
      const lastPeriod = type === "all" ? 0 : (previousPeriodMap.get(unitId) ?? 0);

      // Calcular porcentaje
      let percentage = 0;
      if (type !== "all" && lastPeriod !== 0) {
        percentage = ((currentPeriod - lastPeriod) / lastPeriod) * 100;
      }

      // Redondear a 2 decimales
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

/**
 * ============================================================================
 * DOCUMENTACIÓN TÉCNICA - getUserStats
 * ============================================================================
 * 
 * Esta documentación detalla el funcionamiento interno del endpoint getUserStats
 * para referencia del equipo frontend y mantenimiento futuro.
 * 
 * ----------------------------------------------------------------------------
 * 1. CÁLCULO DEL PERÍODO ANTERIOR
 * ----------------------------------------------------------------------------
 * 
 * El período anterior se calcula basándose en la duración del período actual
 * y el tipo solicitado (week, month, year, all).
 * 
 * ALGORITMO:
 * - Se calcula la duración del período actual en milisegundos:
 *   `periodDuration = endDate.getTime() - startDate.getTime()`
 * 
 * - El período anterior termina justo antes de que comience el actual:
 *   `previousEndDate = new Date(startDate.getTime() - 1)`
 * 
 * - El período anterior comienza retrocediendo la misma duración:
 *   `previousStartDate = new Date(previousEndDate.getTime() - periodDuration)`
 * 
 * IMPORTANTE:
 * - El período anterior SIEMPRE tiene la misma duración que el actual
 * - Solo cambia el rango temporal hacia atrás
 * - Para type="all", no hay período anterior (previousPeriod = null)
 * - No se hacen ajustes por semanas/meses/años calendario, solo se retrocede
 *   la duración exacta del período actual
 * 
 * EJEMPLOS:
 * - Período actual: 2024-01-15 a 2024-01-22 (7 días)
 *   Período anterior: 2024-01-08 a 2024-01-14 (7 días, retrocede 7 días)
 * 
 * - Período actual: 2024-01-01 a 2024-01-31 (31 días)
 *   Período anterior: 2023-12-01 a 2023-12-31 (31 días, retrocede 31 días)
 * 
 * ----------------------------------------------------------------------------
 * 2. AGRUPACIÓN DE DATOS
 * ----------------------------------------------------------------------------
 * 
 * Se realizan DOS queries SQL agrupadas:
 * 
 * QUERY 1 - Período Actual:
 * ```sql
 * SELECT 
 *   unit_id,
 *   COALESCE(SUM(value), 0) as totalValue
 * FROM user_stats
 * WHERE 
 *   user_id = :userId
 *   AND created_at >= :startDate
 *   AND created_at <= :endDate
 * GROUP BY unit_id
 * ```
 * 
 * QUERY 2 - Período Anterior (solo si type !== "all"):
 * ```sql
 * SELECT 
 *   unit_id,
 *   COALESCE(SUM(value), 0) as totalValue
 * FROM user_stats
 * WHERE 
 *   user_id = :userId
 *   AND created_at >= :previousStartDate
 *   AND created_at <= :previousEndDate
 * GROUP BY unit_id
 * ```
 * 
 * QUERY 3 - Obtener Unidades Involucradas:
 * ```sql
 * SELECT * FROM units
 * WHERE id IN (:unitIds)
 * ```
 * 
 * PROCESAMIENTO:
 * 1. Se extraen todos los `unit_id` de ambas queries (períodos actual y anterior)
 * 2. Se crean Mapas para acceso rápido: `currentPeriodMap` y `previousPeriodMap`
 * 3. Se obtienen todas las unidades involucradas usando `inArray` de Drizzle ORM
 * 4. Se combinan los resultados en un solo array con todas las unidades
 * 
 * CARACTERÍSTICAS:
 * - Si una unidad no existe en un período, su valor es 0 (no se omite)
 * - Todas las unidades que aparecen en CUALQUIER período se incluyen en el resultado
 * - Las unidades se obtienen con el objeto completo de la tabla `units`
 * 
 * ----------------------------------------------------------------------------
 * 3. CÁLCULO DEL PORCENTAJE
 * ----------------------------------------------------------------------------
 * 
 * Para cada unidad, se calcula el porcentaje de cambio entre períodos:
 * 
 * FÓRMULA:
 * ```typescript
 * if (type === "all" || lastPeriod === 0) {
 *   percentage = 0
 * } else {
 *   percentage = ((currentPeriod - lastPeriod) / lastPeriod) * 100
 * }
 * ```
 * 
 * REDONDEO:
 * - Se redondea a 2 decimales usando: `Math.round(percentage * 100) / 100`
 * - Ejemplo: 33.33333... → 33.33, -15.789 → -15.79
 * 
 * CASOS ESPECIALES:
 * - Si `type === "all"`: `percentage = 0` (no hay comparación)
 * - Si `lastPeriod === 0`: `percentage = 0` (evita división por cero)
 * - El porcentaje puede ser positivo (aumento) o negativo (disminución)
 * 
 * EJEMPLOS:
 * - currentPeriod=150, lastPeriod=100 → percentage = 50.00 (+50%)
 * - currentPeriod=75, lastPeriod=100 → percentage = -25.00 (-25%)
 * - currentPeriod=100, lastPeriod=0 → percentage = 0
 * - type="all" → percentage = 0
 * 
 * ----------------------------------------------------------------------------
 * 4. QUERIES EJECUTADAS (PSEUDOCÓDIGO SQL)
 * ----------------------------------------------------------------------------
 * 
 * Query 1: Estadísticas del período actual (SIEMPRE se ejecuta)
 * ```sql
 * SELECT 
 *   unit_id AS "unitId",
 *   COALESCE(SUM(value), 0) AS "totalValue"
 * FROM user_stats
 * WHERE 
 *   user_id = $1
 *   AND created_at >= $2  -- startDate (UTC)
 *   AND created_at <= $3  -- endDate (UTC)
 * GROUP BY unit_id
 * ```
 * 
 * Query 2: Estadísticas del período anterior (solo si type !== "all")
 * ```sql
 * SELECT 
 *   unit_id AS "unitId",
 *   COALESCE(SUM(value), 0) AS "totalValue"
 * FROM user_stats
 * WHERE 
 *   user_id = $1
 *   AND created_at >= $2  -- previousStartDate (UTC)
 *   AND created_at <= $3  -- previousEndDate (UTC)
 * GROUP BY unit_id
 * ```
 * 
 * Query 3: Obtener unidades completas (solo si hay unitIds)
 * ```sql
 * SELECT * FROM units
 * WHERE id IN ($1, $2, $3, ...)  -- Array de unitIds
 * ```
 * 
 * NOTAS:
 * - Todas las fechas se usan DIRECTAMENTE en UTC (sin conversiones)
 * - Se usa `COALESCE` para asegurar que la suma nunca sea NULL
 * - Las queries usan parámetros preparados ($1, $2, etc.) para seguridad
 * 
 * ----------------------------------------------------------------------------
 * 5. SUPUESTOS Y DECISIONES DE DISEÑO
 * ----------------------------------------------------------------------------
 * 
 * SUPUESTOS SOBRE DATOS:
 * - Las fechas `startDate` y `endDate` ya están en UTC (validado por Zod)
 * - El `userId` proviene de la sesión autenticada (garantizado por middleware)
 * - Los `unit_id` en `user_stats` siempre referencian unidades existentes
 *   (referencia con cascade, pero se valida que la unidad exista)
 * 
 * SUPUESTOS SOBRE PERÍODOS:
 * - El período "anterior" se calcula retrocediendo la duración exacta,
 *   NO por semanas/meses/años calendario
 * - Si un período no tiene datos para una unidad, su valor es 0
 * - Una unidad puede aparecer en un período pero no en el otro
 * 
 * DECISIONES DE DISEÑO:
 * - Se incluyen TODAS las unidades que aparecen en CUALQUIER período
 *   (no solo las que tienen datos en ambos)
 * - El cálculo del porcentaje evita división por cero (retorna 0)
 * - Para `type="all"`, no se calcula período anterior (optimización)
 * - Se usan Mapas para acceso O(1) en lugar de búsquedas lineales
 * 
 * LIMITACIONES:
 * - Si una unidad se elimina de la BD pero tiene registros históricos,
 *   esa unidad se omite del resultado (filtrada con `.filter()`)
 * - El cálculo del período anterior NO considera meses/años calendario
 *   exactos (ej: febrero tiene 28/29 días, pero retrocede la duración exacta)
 * 
 * ----------------------------------------------------------------------------
 * 6. INFORMACIÓN ÚTIL PARA EL FRONTEND
 * ----------------------------------------------------------------------------
 * 
 * ESTRUCTURA DE RESPUESTA:
 * ```typescript
 * {
 *   stats: [
 *     {
 *       unit: Unit,              // Objeto completo de la tabla units
 *                                // Incluye: id, name, pluralName, completedWord, etc.
 *       percentage: number,      // Porcentaje de cambio (puede ser negativo)
 *       currentPeriod: number,   // Suma total del período actual
 *       lastPeriod: number       // Suma total del período anterior
 *     },
 *     // ... más unidades
 *   ]
 * }
 * ```
 * 
 * NOTAS PARA EL FRONTEND:
 * 
 * 1. FECHAS:
 *    - Las fechas `startDate` y `endDate` recibidas ya están en UTC
 *    - Se usan DIRECTAMENTE sin conversiones
 *    - El período anterior se calcula retrocediendo la duración exacta
 * 
 * 2. PORCENTAJES:
 *    - Ya están redondeados a 2 decimales
 *    - Pueden ser positivos (aumento) o negativos (disminución)
 *    - Si `type="all"` o `lastPeriod=0`, el porcentaje será 0
 * 
 * 3. UNIDADES:
 *    - El objeto `unit` incluye todos los campos de la tabla `units`
 *    - Útil para mostrar nombre, plural, palabra de completado, etc.
 *    - Si una unidad no tiene datos en un período, su valor es 0
 * 
 * 4. CASOS DE USO:
 *    - Comparar semana actual vs semana anterior
 *    - Comparar mes actual vs mes anterior
 *    - Comparar año actual vs año anterior
 *    - Ver estadísticas totales sin comparación (`type="all"`)
 * 
 * 5. EJEMPLOS DE USO:
 * 
 *    Ejemplo 1: Comparar semana actual vs anterior
 *    ```typescript
 *    // Request
 *    GET /user-stats?startDate=2024-01-15T00:00:00Z&endDate=2024-01-22T23:59:59Z&type=week
 *    
 *    // Response
 *    {
 *      stats: [
 *        {
 *          unit: { id: "kg", name: "kilogramo", ... },
 *          percentage: 15.5,        // +15.5% vs semana anterior
 *          currentPeriod: 23.5,
 *          lastPeriod: 20.3
 *        }
 *      ]
 *    }
 *    ```
 * 
 *    Ejemplo 2: Estadísticas totales sin comparación
 *    ```typescript
 *    // Request
 *    GET /user-stats?startDate=2024-01-01T00:00:00Z&endDate=2024-12-31T23:59:59Z&type=all
 *    
 *    // Response
 *    {
 *      stats: [
 *        {
 *          unit: { id: "kg", name: "kilogramo", ... },
 *          percentage: 0,           // Siempre 0 para type="all"
 *          currentPeriod: 150.0,
 *          lastPeriod: 0            // Siempre 0 para type="all"
 *        }
 *      ]
 *    }
 *    ```
 * 
 * 6. MANEJO DE ERRORES:
 *    - Errores de BD: status 500 con mensaje genérico
 *    - El frontend debe manejar casos donde `stats` esté vacío
 *    - Si una unidad se elimina pero tiene datos históricos, no aparece en el resultado
 * 
 * 7. OPTIMIZACIÓN:
 *    - El endpoint es eficiente: solo 2-3 queries SQL
 *    - Se agrupan datos en la BD (no en memoria)
 *    - Se usan Mapas para combinación O(1) de resultados
 *    - Solo se obtienen las unidades necesarias (no todas las unidades)
 * 
 * ============================================================================
 */