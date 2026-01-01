import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, pgEnum, real, AnyPgColumn } from "drizzle-orm/pg-core";

const commonColumns = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const units = pgTable("units", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ...commonColumns,
});

export const rolesEnum = pgEnum("goal_types", ["target", "manual", "goals"]);

export const goals = pgTable("goals", {
  id: text("id").primaryKey(),
  parentGoalId: text("parent_goal_id").references((): AnyPgColumn => goals.id),
  userId: text("user_id").references(() => user.id),
  unitId: text("unit_id").references(() => units.id),
  title: text("title").notNull(),
  goalType: rolesEnum("goal_type").notNull(),
  target: real("target"),
  description: text("description"),
  completedAt: timestamp("completed_at"),
  ...commonColumns,
})

export const goalProgress = pgTable("goal_progress", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").references(() => goals.id),
  progress: real("progress"),
  ...commonColumns,
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  goals: many(goals),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const unitRelations = relations(units, ({ many }) => ({
  goals: many(goals),
}));

export const goalRelations = relations(goals, ({ one, many }) => ({
  units: one(units, {
    fields: [goals.unitId],
    references: [units.id],
  }),
  users: one(user, {
    fields: [goals.userId],
    references: [user.id],
  }),
  goalProgress: many(goalProgress),
  parentGoal: one(goals, {
    fields: [goals.parentGoalId],
    references: [goals.id],
  }),
}));

export const goalProgressRelations = relations(goalProgress, ({ one }) => ({
  goal: one(goals, {
    fields: [goalProgress.goalId],
    references: [goals.id],
  }),
}));