import { z } from "zod"

export const unitSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1, "Nombre requerido"),
  created_at: z.date(),
  updated_at: z.date(),
})

export const createUnitSchema = unitSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
})

export type UnitSchema = z.infer<typeof unitSchema>
export type CreateUnitSchema = z.infer<typeof createUnitSchema>