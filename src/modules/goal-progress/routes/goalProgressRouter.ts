import { betterAuthMiddleware } from "../../../lib/auth";
import { createGoalProgress } from "../controllers/goalProgressContoller";
import { createGoalProgressSchema } from "../schemas/goalProgressSchema";

export const goalProgressRouter = betterAuthMiddleware
  .group("/goal-progress", (group) =>
    group
      .post("/", createGoalProgress, {
        auth: true,
        body: createGoalProgressSchema,
      })
  )