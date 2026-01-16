import { z } from "zod";
import { utcDateStringSchema } from "../../../lib/dateSchemas";

/**
 * Schema de validación para estadísticas de unidades
 * 
 * CONTRATO DE FECHAS:
 * - El frontend envía fechas YA convertidas a UTC en formato ISO 8601 UTC
 * - startUtc y endUtc son Date objects parseados desde ISO 8601 UTC
 * - Se usan DIRECTAMENTE en consultas sin conversiones
 */
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
