import { db } from "../../../db/db";
import { units } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { Session } from "../../../lib/auth";

export async function getUnitsByUser(session: Session) {
  const userUnits = await db.select().from(units).where(eq(units.id, session.session.userId));
  return {
    units: userUnits,
  }
}