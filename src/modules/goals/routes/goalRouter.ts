import { betterAuthMiddleware } from "../../../lib/auth";
import { paginationSchema } from "../../../types/pagination";
import { createGoal, deleteGoal, getGoalById, getGoalsByUser, getGoalsWithTypeGoal, getStatistics, goalStatistics, toggleGoalCompletion } from "../controllers/goalsController";
import { createGoalSchema, goalTypes } from "../schemas/goalSchema";
import { utcDateStringSchema } from "../../../lib/dateSchemas";
import { z } from "zod";

// Parámetros booleanos en query llegan como string "true"/"false"; coerce.boolean() convierte "false" en true
const optionalBooleanSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((val) => (val === undefined ? undefined : val === "true"));

const byUserQuerySchema = paginationSchema.extend({
  // Fechas YA convertidas a UTC en formato ISO 8601 UTC
  startDate: utcDateStringSchema,
  endDate: utcDateStringSchema,
  // Búsqueda por título y/o descripción (opcional)
  search: z.string().optional(),
  // Filtro completadas: true = solo completadas, false = solo no completadas (opcional)
  completed: optionalBooleanSchema,
  // Filtro por tipo de meta: "target" | "manual" | "goals" (opcional)
  goalType: goalTypes.optional(),
  // Excluir metas hijas: true = solo metas raíz (sin parentGoalId) (opcional)
  excludeChildGoals: optionalBooleanSchema,
});

export const goalRouter = betterAuthMiddleware
  .group("/goals", (group) =>
    group
      .get("/by-user", getGoalsByUser, {
        auth: true,
        query: byUserQuerySchema,
      })
      .get("/:id", ({ params, status }) => getGoalById({ id: params.id, status }), {
        auth: true,
        params: z.object({
          id: z.string(),
        }),
      })
      .post("/",
        ({ session, user, body, status }) => createGoal({ body, session, user, status }), {
        auth: true,
        body: createGoalSchema,
      })
      .get("/statistics", ({ session, user, status, query }) =>
        getStatistics({ session, user, status, query }), {
        auth: true,
        query: z.object({
          // Fechas YA convertidas a UTC en formato ISO 8601 UTC
          // El backend las usa directamente sin conversiones
          startDate: utcDateStringSchema,
          endDate: utcDateStringSchema,
        }),
      })
      .put(
        "/:id/toggle-completion",
        ({ params, status }) => toggleGoalCompletion({ id: params.id, status }), {
        auth: true,
        params: z.object({
          id: z.string(),
        }),
      })
      .get("/with-type-goal",
        ({ session, user, status }) => getGoalsWithTypeGoal({ session, user, status }), {
        auth: true,
      })
      .delete("/:id", ({ params, status }) => deleteGoal({ id: params.id, status }), {
        auth: true,
        params: z.object({
          id: z.string(),
        }),
      })
      .get("/statistics/:id",
        ({ params, status, user }) => goalStatistics({ id: params.id, status, user }), {
        auth: true,
        params: z.object({
          id: z.string(),
        }),
      })
  )