import { Elysia } from "elysia";
import { cors } from '@elysiajs/cors'
import { betterAuthMiddleware } from "./lib/auth";
import { goalRouter } from "./modules/goals/routes/goalRouter";
import { unitRouter } from "./modules/units/routes/unitRouter";

export default new Elysia()
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