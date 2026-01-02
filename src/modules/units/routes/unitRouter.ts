import { createUnit, getUnitsByUser } from "../controllers/unitController";
import { betterAuthMiddleware } from "../../../lib/auth";
import { createUnitSchema } from "../schemas/unitSchema";

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
  );