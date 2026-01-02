import { Elysia, InlineHandler } from "elysia";
import { betterAuthMiddleware } from "./auth";
import { cors } from '@elysiajs/cors'
import { unitRouter } from "../modules/units/routes/unitRouter";
import { goalRouter } from "../modules/goals/routes/goalRouter";

const app = new Elysia()
  .use(
    cors({
      origin: true, // Allows all origins by setting 'Access-Control-Allow-Origin' to '*'
      methods: '*', // Allows all HTTP methods: GET, POST, PUT, DELETE, etc.
      allowedHeaders: ['Content-Type', 'Authorization'], // Common headers often needed
      credentials: true, // Allows cookies to be sent in cross-origin requests
    })
  )
  .use(betterAuthMiddleware)
  .use(goalRouter)
  .use(unitRouter)
  .get('/', ({ request }) => {
    return {
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
    }
  })

export default app;
export type AppHandler = InlineHandler<typeof app>