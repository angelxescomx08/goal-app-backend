# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev        # Start dev server with hot reload (port 3000)
bun run generate   # Generate Drizzle migration files from schema changes
bun run migrate    # Run pending migrations
bun run push       # Push schema directly to DB (dev only)
```

Database runs in Docker:
```bash
docker compose up -d   # Start PostgreSQL container
```

## Architecture Overview

This is an **Elysia + Drizzle ORM + PostgreSQL** REST API for a hierarchical goal-tracking app. Authentication is handled by **better-auth** with email/password and Google OAuth.

### Module Structure

Each feature lives in `src/modules/<feature>/` with three layers:

- `routes/<feature>Router.ts` — Elysia route definitions with Zod query/body schemas
- `controllers/<feature>Controller.ts` — business logic and DB queries via Drizzle
- `schemas/<feature>Schema.ts` — Zod input validation schemas

Four modules: `goals`, `goal-progress`, `units`, `user-stats`.

### Authentication

`src/lib/auth.ts` defines a custom Elysia macro. Routes pass `{ auth: true }` in their options to require a valid session — the macro validates cookies, returns 401 otherwise, and injects `user` and `session` into context. No manual session checks in controllers.

```typescript
.get("/", handler, { auth: true, query: querySchema })
```

### Database Schema (`src/db/schema.ts`)

Key tables:

| Table | Purpose |
|---|---|
| `goals` | Core entity; supports hierarchy via `parentGoalId` |
| `goalProgress` | Time-series progress records for `"target"` goals |
| `units` | User-defined units (e.g., "km", "pages") |
| `userStats` | Aggregated stats per unit, updated on goal completion |

**Goal types:**
- `"target"` — numeric goal with `unitId` and progress tracking
- `"manual"` — boolean completion, no progress records
- `"goals"` — container; completion auto-calculated from children

### Hierarchical Goal Completion

`src/modules/goals/controllers/updateParentGoalProgress.ts` recursively walks up the `parentGoalId` tree when a child goal changes state. It marks parents complete when all children are done and creates `userStats` entries on completion. Always call this after any goal state mutation.

### Date Handling (Critical)

See `DATE_HANDLING.md` for full details. The contract:

- All dates stored and transmitted as **UTC ISO 8601** strings ending in `Z` (e.g., `"2026-01-16T05:59:59.999Z"`)
- Use `nowUTC()` from `src/lib/dateUtils.ts` for server-generated timestamps
- Use `utcDateStringSchema` from `src/lib/dateSchemas.ts` to validate incoming date strings
- Never convert timezones — use dates as-is throughout the stack
- PostgreSQL timezone is set to UTC globally

### Environment Variables

```
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### CORS

Configured in `src/index.ts` to allow `localhost:5173` (dev) and a Vercel production origin. Cross-origin cookies require `sameSite: "none"` and `secure: true`, already set in the auth config.
