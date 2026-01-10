import { betterAuthMiddleware } from "../../../lib/auth";
import { paginationSchema } from "../../../types/pagination";
import { createGoal, deleteGoal, getGoalById, getGoalsByUser, getGoalsWithTypeGoal, getStatistics, goalStatistics, toggleGoalCompletion } from "../controllers/goalsController";
import { createGoalSchema } from "../schemas/goalSchema";
import { z } from "zod";

export const goalRouter = betterAuthMiddleware
  .group("/goals", (group) =>
    group
      .get("/by-user", getGoalsByUser, {
        auth: true,
        query: paginationSchema.extend({
          startDate: z.string(),
          endDate: z.string(),
        }),
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
          startDate: z.string(),
          endDate: z.string(),
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