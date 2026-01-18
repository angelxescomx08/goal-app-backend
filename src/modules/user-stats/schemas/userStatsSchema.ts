import { z } from "zod";
import { utcDateStringSchema } from "../../../lib/dateSchemas";

export const userStatsQuerySchema = z.object({
  startDate: utcDateStringSchema,
  endDate: utcDateStringSchema,
  type: z.enum(["week", "month", "year", "all"]),
});

export type UserStatsQuery = z.infer<typeof userStatsQuerySchema>;