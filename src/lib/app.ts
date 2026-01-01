import { Elysia, InlineHandler } from "elysia";
import { betterAuthMiddleware } from "./auth";
import { cors } from '@elysiajs/cors'
import { createGoal, getGoalsByUser } from "../modules/goals/controllers/goalsController";
import { createGoalSchema } from "../modules/goals/schemas/goalSchema";

export const app = new Elysia()
  .use(
    cors({
      origin: ['http://localhost:1420'],
    })
  )
  .use(betterAuthMiddleware)
  .group("/goals", (app) =>
    app
      .get("/by-user", getGoalsByUser, {
        auth: true,
      })
      .post("/", ({ session, user, body, status }) => createGoal({ body, session, user, status }), {
        auth: true,
        body: createGoalSchema,
      }),
  );

export type AppHandler = InlineHandler<typeof app>