import { Elysia } from "elysia";
import { auth } from "./lib/auth";
import { cors } from '@elysiajs/cors'
import { getGoalsByUser } from "./modules/goals/controllers/goalsController";

const betterAuth = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        });
        if (!session) return status(401);
        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });

const app = new Elysia()
  .use(
    cors({
      origin: ['http://localhost:1420'],
    })
  )
  .use(betterAuth)
  .group("/goals", (app) =>
    app
      .get("/by-user", getGoalsByUser, {
        auth: true,
      })
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);