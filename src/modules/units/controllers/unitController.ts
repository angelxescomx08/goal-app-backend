import { db } from "../../../db/db";
import { units } from "../../../db/schema";
import { Session } from "../../../lib/auth";
import { CreateUnitSchema } from "../schemas/unitSchema";
import { Context } from "elysia";
import crypto from "node:crypto";

export async function getUnitsByUser() {
  const userUnits = await db.select().from(units);
  return {
    units: userUnits,
  }
}

export async function createUnit(context: {
  body: CreateUnitSchema,
  session: Session["session"],
  user: Session["user"],
  status: Context["status"]
}) {
  const { body, status } = context;
  try {
    const newUnit = await db.insert(units).values({
      id: crypto.randomUUID(),
      name: body.name,
      pluralName: body.pluralName,
      completedWord: body.completedWord,
    }).returning();
    return status(201, { unit: newUnit });
  } catch (error) {
    console.error(error);
    return status(500, { error: "Falló la creación de la unidad" });
  }
}