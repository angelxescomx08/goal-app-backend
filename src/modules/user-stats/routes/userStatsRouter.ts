import { betterAuthMiddleware } from "../../../lib/auth";
import { getUserStats } from "../controllers/userStatsControllers";
import { userStatsQuerySchema } from "../schemas/userStatsSchema";

export const userStatsRouter = betterAuthMiddleware
  .group("/user-stats", (group) =>
    group
      .get("/", getUserStats, {
        auth: true,
        query: userStatsQuerySchema,
      })
  )