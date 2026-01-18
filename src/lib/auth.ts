import { betterAuth } from "better-auth/minimal";
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
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutos — reduce consultas getSession/useSession a la DB
    },
  },
  advanced: {
    // 1. Forzar cookies seguras para HTTPS (Vercel)
    useSecureCookies: true,
    // 2. Configuración global de cookies para cross-site
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
    // 3. Si tu versión soporta 'crossOriginCookies' (v1.3+), actívalo:
    // crossOriginCookies: { enabled: true } 
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
  .onBeforeHandle(({ request }) => {
    //console.log("Cookie Header:", request.headers.get("cookie"));
  })
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