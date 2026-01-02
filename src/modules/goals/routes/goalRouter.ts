import { betterAuthMiddleware } from "../../../lib/auth";
import { createGoal, getGoalsByUser } from "../controllers/goalsController";
import { createGoalSchema } from "../schemas/goalSchema";

export const goalRouter = betterAuthMiddleware
  .group("/goals", (group) =>
    group
      .get("/by-user", getGoalsByUser, {
        auth: true,
      })
      .post("/",
        ({ session, user, body, status }) => createGoal({ body, session, user, status }), {
        auth: true,
        body: createGoalSchema,
      }),
  )