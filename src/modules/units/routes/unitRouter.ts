import { getUnitsByUser } from "../controllers/unitController";
import { betterAuthMiddleware } from "../../../lib/auth";

export const unitRouter = betterAuthMiddleware
  .group("/units", (group) =>
    group.get("/by-user", getUnitsByUser, {
      auth: true,
    })
  );