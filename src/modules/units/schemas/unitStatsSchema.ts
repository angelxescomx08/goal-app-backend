import { z } from "zod";
import { utcDateStringSchema } from "../../../lib/dateSchemas";

export const unitStatsQuerySchema = z.object({
  unitId: z.string().uuid("unitId debe ser un UUID válido"),
  startUtc: utcDateStringSchema,
  endUtc: utcDateStringSchema,
}).refine(
  (data) => data.startUtc <= data.endUtc,
  {
    message: "startUtc debe ser menor o igual a endUtc",
    path: ["endUtc"]
  }
);

export type UnitStatsQuery = z.infer<typeof unitStatsQuerySchema>;
