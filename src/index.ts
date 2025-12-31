import { Elysia, Context } from "elysia";
import { auth } from "./lib/auth";
import { cors } from '@elysiajs/cors'

const betterAuthView = (context: Context) => {
  const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"]
  // validate request method
  if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
    return auth.handler(context.request);
  } else {
    return context.status(405);
  }
}

const app = new Elysia().use(cors({
  origin: ['http://localhost:1420'],
})).all("/api/auth/*", betterAuthView).listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);