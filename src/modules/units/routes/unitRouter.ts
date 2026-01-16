import { createUnit, getUnitsByUser } from "../controllers/unitController";
import { getUnitStatistics } from "../controllers/unitStatsController";
import { betterAuthMiddleware } from "../../../lib/auth";
import { createUnitSchema } from "../schemas/unitSchema";
import { unitStatsQuerySchema } from "../schemas/unitStatsSchema";

export const unitRouter = betterAuthMiddleware
  .group("/units", (group) =>
    group
      .get("/by-user", getUnitsByUser, {
        auth: true,
      })
      .post("/", createUnit, {
        auth: true,
        body: createUnitSchema,
      })
      .get("/statistics", ({ session, status, query }) =>
        getUnitStatistics({ session, status, query }), {
        auth: true,
        query: unitStatsQuerySchema,
      })
  );