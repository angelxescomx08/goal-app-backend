import { tool } from "langchain";
import * as z from "zod";
import { db } from "../../../db/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { goals, units } from "../../../db/schema";

export const getGoals = tool(
  async (input) => {
    const goalsByUser = await db.query.goals.findMany({
      where: eq(goals.userId, input.userId),
    });
    return JSON.stringify(goalsByUser);
  },
  {
    name: "get_goals",
    description: "Get the goals for the user by their user id, the goals are returned as an array of objects with the following properties: id, title, description, target, currentProgress, completedAt",
    schema: z.object({
      userId: z.string().describe("The user id to get the goals for"),
    }),
  }
);

export const getGoalsBetweenDates = tool(
  async (input) => {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    const goalsByUser = await db.query.goals.findMany({
      where: and(
        eq(goals.userId, input.userId),
        gte(goals.createdAt, startDate),
        lte(goals.createdAt, endDate)
      ),
    });
    return JSON.stringify(goalsByUser);
  },
  {
    name: "get_goals_between_dates",
    description: "Get the goals for the user by their user id and between two dates",
    schema: z.object({
      userId: z.string().describe("The user id to get the goals for"),
      startDate: z.string().describe("The start date to get the goals for"),
      endDate: z.string().describe("The end date to get the goals for"),
    }),
  }
);

export const createUnit = tool(
  async (input) => {
    const unit = await db.insert(units).values({
      id: crypto.randomUUID(),
      name: input.name,
      pluralName: input.pluralName,
      completedWord: input.completedWord,
    }).returning();
    return JSON.stringify(unit);
  },
  {
    name: "create_unit",
    description: "Create a unit for the user by their user id",
    schema: z.object({
      name: z.string().describe("The name of the unit"),
      pluralName: z.string().describe("The plural name of the unit"),
      completedWord: z.string().describe("The completed word of the unit"),
    }),
  }
);
