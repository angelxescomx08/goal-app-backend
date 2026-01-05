import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/db";
import * as schema from "../db/schema";
import Elysia from "elysia";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL as string,
  trustedOrigins: [
    'http://localhost:5173',
    'https://goals-app-react.vercel.app'
  ],
  cookies: {
    cookieOptions: {
      sameSite: "none",
      secure: true,
    }
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
});

export const betterAuthMiddleware = new Elysia({ name: "better-auth" })
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

export type Session = typeof auth.$Infer.Session;