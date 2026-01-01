import { Session } from "../../../lib/auth";
import { db } from "../../../db/db";
import { goals } from '../../../db/schema';
import { eq } from "drizzle-orm";
import { CreateGoalSchema } from "../schemas/goalSchema";
import { Context, } from "elysia";
import crypto from "node:crypto";

export async function getGoalsByUser(session: Session) {
  const userGoals = await db.select().from(goals).where(eq(goals.userId, session.user.id));
  return {
    goals: userGoals,
  };
}

export async function createGoal(context: {
  body: CreateGoalSchema,
  session: Session["session"],
  user: Session["user"],
  status: Context["status"]
}) {
  const { body, user, status } = context;
  try {
    const newGoal = await db.insert(goals).values({
      id: crypto.randomUUID(),
      userId: user.id,
      title: body.title,
      goalType: body.goal_type,
      description: body.description,
      parentGoalId: body.parent_goal_id,
      unitId: body.unit_id,
      target: body.target,
    }).returning();

    return status(201, { goal: newGoal });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la creación de la meta" });
  }

}