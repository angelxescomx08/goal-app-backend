import { Elysia } from "elysia";
import { cors } from '@elysiajs/cors'
import { betterAuthMiddleware } from "./lib/auth";
import { goalRouter } from "./modules/goals/routes/goalRouter";
import { unitRouter } from "./modules/units/routes/unitRouter";
import { goalProgressRouter } from "./modules/goal-progress/routes/goalProgressRouter";

export default new Elysia()
  .use(
    cors({
      origin: ['https://goals-app-react.vercel.app', 'http://localhost:5173'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  )
  .use(betterAuthMiddleware)
  .use(goalRouter)
  .use(unitRouter)
  .use(goalProgressRouter)
  .get('/', ({ request }) => {
    return {
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
    }
  })