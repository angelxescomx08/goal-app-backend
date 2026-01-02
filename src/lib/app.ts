import { Elysia, InlineHandler } from "elysia";
import { betterAuthMiddleware } from "./auth";
import { cors } from '@elysiajs/cors'
import { unitRouter } from "../modules/units/routes/unitRouter";
import { goalRouter } from "../modules/goals/routes/goalRouter";

export const app = new Elysia()
  .use(
    cors()
  )
  .use(betterAuthMiddleware)
  .use(goalRouter)
  .use(unitRouter)

export type AppHandler = InlineHandler<typeof app>