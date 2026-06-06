import { betterAuthMiddleware } from "../../../lib/auth";
import { createGoalProgress, deleteGoalProgress, listGoalProgress, updateGoalProgress } from "../controllers/goalProgressContoller";
import { createGoalProgressSchema, listGoalProgressQuerySchema, updateGoalProgressSchema } from "../schemas/goalProgressSchema";
import { z } from "zod";

export const goalProgressRouter = betterAuthMiddleware
  .group("/goal-progress", (group) =>
    group
      .post("/", createGoalProgress, {
        auth: true,
        body: createGoalProgressSchema,
      })
      .get("/", ({ query, status }) => listGoalProgress({ query, status }), {
        auth: true,
        query: listGoalProgressQuerySchema,
      })
      .delete("/:id", ({ params, status }) => deleteGoalProgress({ id: params.id, status }), {
        auth: true,
        params: z.object({ id: z.string() }),
      })
      .put("/:id", ({ params, body, status }) => updateGoalProgress({ id: params.id, body, status }), {
        auth: true,
        params: z.object({ id: z.string() }),
        body: updateGoalProgressSchema,
      })
  )