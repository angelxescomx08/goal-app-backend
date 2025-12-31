import { Session } from "../../../lib/auth";
import { db } from "../../../db/db";
import { goals } from "../../../db/schema";
import { eq } from "drizzle-orm";

export async function getGoalsByUser(user: Session) {
  const userGoals = await db.select().from(goals).where(eq(goals.userId, user.user.id));
  return {
    goals: userGoals,
  };
}