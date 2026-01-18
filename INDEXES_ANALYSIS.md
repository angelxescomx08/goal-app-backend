# Análisis de índices – Backend Goals

## 1. Resumen general

Se han analizado todos los controladores, utilidades y rutas del proyecto para identificar patrones de acceso a la base de datos. **Better-Auth** gestiona `user`, `session`, `account` y `verification`; los índices existentes para `session(user_id)`, `account(user_id)` y `verification(identifier)` ya cubren los accesos típicos de ese módulo.

Las tablas **goals**, **goal_progress** y **user_stats** no tenían índices además de las PK/FK. Se proponen **7 índices nuevos** en esas tres tablas, justificados por filtros `WHERE`, `JOIN`, rangos de fechas y `GROUP BY` reales del código.

**Principios aplicados:**
- Índices compuestos con orden: igualdad (`=`) primero, rango (`BETWEEN`, `>=`, `<=`) después.
- Evitar redundancia con PK/UNIQUE y con otros índices propuestos.
- No indexar `units` (maestra pequeña, accesos por PK) ni tablas de auth ya cubiertas.

---

## 2. Índices por tabla

### Tabla: `goals`

| Índice | Columnas | Líneas que afecta |
|--------|----------|-------------------|
| `idx_goals_user_id_created_at` | `(user_id, created_at)` | `src/modules/goals/controllers/goalsController.ts:33-36` (.where(and(eq(goals.userId), gte(goals.createdAt), lte(goals.createdAt)))), `src/modules/goals/controllers/goalsController.ts:139-144` (findMany where and(eq(goals.userId), gte(goals.createdAt), lte(goals.createdAt))) |
| `idx_goals_user_id_goal_type` | `(user_id, goal_type)` | `src/modules/goals/controllers/goalsController.ts:197-201` (findMany where and(eq(goals.userId), eq(goals.goalType, "goals"))) |
| `idx_goals_parent_goal_id` | `(parent_goal_id)` | `src/modules/goals/controllers/goalsController.ts:110-112` (findMany where eq(goals.parentGoalId, goal.id)), `src/modules/goals/utils/updateParentGoalProgress.ts:11-13` (findMany where eq(goals.parentGoalId, parentGoalId)) |
| `idx_goals_unit_id` | `(unit_id)` | `src/modules/units/controllers/unitStatsController.ts:59-65` (eq(goals.unitId, query.unitId) en progressOverTimeQuery), `src/modules/units/controllers/unitStatsController.ts:90-95` (eq(goals.unitId, query.unitId) en activityCountQuery), `src/modules/units/controllers/unitStatsController.ts:111-114` (eq(goals.unitId, query.unitId) en progressByGoalQuery) |

### Tabla: `goal_progress`

| Índice | Columnas | Líneas que afecta |
|--------|----------|-------------------|
| `idx_goal_progress_goal_id_created_at` | `(goal_id, created_at)` | `src/modules/goals/controllers/goalsController.ts:249-251` (findMany where eq(goalProgress.goalId, goal.id)), `src/modules/units/controllers/unitStatsController.ts:53-67` (progressOverTime), `src/modules/units/controllers/unitStatsController.ts:84-98` (activityCount), `src/modules/units/controllers/unitStatsController.ts:101-117` (progressByGoal) |

### Tabla: `user_stats`

| Índice | Columnas | Líneas que afecta |
|--------|----------|-------------------|
| `idx_user_stats_user_id_created_at` | `(user_id, created_at)` | `src/modules/user-stats/controllers/userStatsControllers.ts:65-71` (.where(and(eq(userStats.userId), gte(userStats.createdAt, startDate), lte(userStats.createdAt, endDate)))), `src/modules/user-stats/controllers/userStatsControllers.ts:88-93` (.where(and(eq(userStats.userId), gte(userStats.createdAt, previousPeriod.startDate), lte(userStats.createdAt, previousPeriod.endDate)))) |

---

## 3. Índices existentes (no modificar)

| Tabla | Índice | Columnas | Origen |
|-------|--------|----------|--------|
| `session` | `session_userId_idx` | `(user_id)` | Migración 0000 / schema |
| `account` | `account_userId_idx` | `(user_id)` | Migración 0000 / schema |
| `verification` | `verification_identifier_idx` | `(identifier)` | Migración 0000 / schema |

**Conclusión:** No son redundantes ni están mal ordenados. Cubren lookups por `user_id` (session, account) y por `identifier` (verification). Se mantienen.

---

## 4. Tablas sin índices adicionales

| Tabla | Motivo |
|-------|--------|
| `user` | Accesos por `id` (PK) y `email` (UNIQUE). Índices implícitos suficientes. |
| `units` | Catálogo pequeño; `getUnitsByUser` hace `SELECT *`; `units.id` en `WHERE`/`IN` usa la PK. |
| `session` | `session_userId_idx` suficiente; `token` ya tiene UNIQUE. |
| `account` | `account_userId_idx` suficiente. |
| `verification` | `verification_identifier_idx` suficiente. |

---

## 5. Impacto por endpoint

| Endpoint / flujo | Índices | Líneas |
|------------------|---------|--------|
| `GET /goals` (getGoalsByUser) | `idx_goals_user_id_created_at` | `src/modules/goals/controllers/goalsController.ts:33-36` |
| `GET /goals/statistics` (getStatistics) | `idx_goals_user_id_created_at` | `src/modules/goals/controllers/goalsController.ts:139-144` |
| `GET /goals/with-type-goal` (getGoalsWithTypeGoal) | `idx_goals_user_id_goal_type` | `src/modules/goals/controllers/goalsController.ts:197-201` |
| `GET /goals/:id` (getGoalById, children) | `idx_goals_parent_goal_id` | `src/modules/goals/controllers/goalsController.ts:110-112` |
| createGoal, deleteGoal, toggleGoalCompletion → updateParentGoalProgress | `idx_goals_parent_goal_id` | `src/modules/goals/utils/updateParentGoalProgress.ts:11-13` |
| `GET /units/:unitId/statistics` (getUnitStatistics) | `idx_goals_unit_id`, `idx_goal_progress_goal_id_created_at` | `src/modules/units/controllers/unitStatsController.ts:53-67, 84-98, 101-117` |
| `GET /goals/:id/statistics` (goalStatistics) | `idx_goal_progress_goal_id_created_at` | `src/modules/goals/controllers/goalsController.ts:249-251` |
| `GET /user-stats` (getUserStats) | `idx_user_stats_user_id_created_at` | `src/modules/user-stats/controllers/userStatsControllers.ts:65-71, 88-93` |
