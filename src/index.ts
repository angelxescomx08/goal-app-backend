import { Elysia } from "elysia";
import { cors } from '@elysiajs/cors'
import { betterAuthMiddleware } from "./lib/auth";
import { goalRouter } from "./modules/goals/routes/goalRouter";
import { unitRouter } from "./modules/units/routes/unitRouter";
import { goalProgressRouter } from "./modules/goal-progress/routes/goalProgressRouter";
import { userStatsRouter } from "./modules/user-stats/routes/userStatsRouter";
import { chatRouter } from "./modules/chat/routes/chatRouter";

export default new Elysia()
  .use(
    cors({
      origin: ['https://goals-app-react.vercel.app', 'http://localhost:5173'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    })
  )
  .use(betterAuthMiddleware)
  .use(goalRouter)
  .use(unitRouter)
  .use(goalProgressRouter)
  .use(userStatsRouter)
  .use(chatRouter)
  .get('/', ({ request }) => {
    return {
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
    }
  })