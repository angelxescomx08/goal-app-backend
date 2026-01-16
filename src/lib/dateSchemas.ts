import { z } from "zod";
import { isValidUTCISOString, parseUTCDate } from "./dateUtils";

/**
 * CONTRATO DE FECHAS:
 * - El frontend envía fechas YA convertidas a UTC en formato ISO 8601 UTC
 * - El backend usa las fechas directamente sin conversiones
 * - Todas las fechas deben terminar en 'Z' (UTC obligatorio)
 * 
 * PROHIBICIONES:
 * - ❌ No aceptar "YYYY-MM-DD" en queries
 * - ❌ No usar new Date() para reinterpretar fechas
 * - ❌ No aplicar offsets manuales
 */

/**
 * Schema Zod para fechas ISO 8601 UTC
 * 
 * REQUISITOS:
 * - Debe terminar en 'Z' (UTC obligatorio)
 * - Formato: "2026-01-16T05:59:59.999Z"
 * 
 * Ejemplos válidos:
 * - "2026-01-15T18:00:00Z"
 * - "2026-01-15T18:00:00.000Z"
 * - "2026-01-16T05:59:59.999Z"
 */
export const utcDateStringSchema = z.string().refine(
  (val) => isValidUTCISOString(val),
  {
    message: "La fecha debe estar en formato ISO 8601 UTC y terminar en 'Z'. Ejemplo: 2026-01-16T05:59:59.999Z"
  }
).transform((val) => parseUTCDate(val));

/**
 * Schema Zod para rango de fechas ISO 8601 UTC
 * Las fechas se usan directamente sin conversiones
 */
export const utcDateRangeSchema = z.object({
  startDate: utcDateStringSchema,
  endDate: utcDateStringSchema,
}).refine(
  (data) => data.startDate <= data.endDate,
  {
    message: "startDate debe ser menor o igual a endDate",
    path: ["endDate"]
  }
);

/**
 * Schema Zod para Date objects (ya parseadas)
 * Asegura que sea una fecha válida
 */
export const dateSchema = z.date().refine(
  (date) => !isNaN(date.getTime()),
  {
    message: "Fecha inválida"
  }
);
