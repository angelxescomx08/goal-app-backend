import { z } from "zod"
import { dateSchema } from "../../../lib/dateSchemas"

export const goalTypes = z.enum(["target", "manual", "goals"])

/**
 * Schema para Goal
 * IMPORTANTE: Todas las fechas se manejan en UTC
 * - createdAt, updatedAt, completedAt: Date objects en UTC
 */
export const goalSchema = z.object({
  id: z.uuid(),
  parentGoalId: z.uuid().nullish(),
  userId: z.uuid(),
  unitId: z.uuid().nullish(),
  title: z.string().min(1, "Título requerido"),
  goalType: goalTypes,
  target: z.number().nullish(),
  currentProgress: z.number().nullish(),
  description: z.string().min(1, "Descripción requerida"),
  completedAt: dateSchema.nullish(), // UTC Date
  createdAt: dateSchema, // UTC Date
  updatedAt: dateSchema, // UTC Date
})

export const createGoalSchema = goalSchema.omit({
  id: true,
  userId: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
}).superRefine((data, ctx) => {
  if (data.goalType === "target") {
    if (data.unitId === null) {
      ctx.addIssue({
        path: ["unitId"],
        message: "La unidad es requerida cuando el tipo es target",
        code: "custom",
      })
    }

    if (!data.target) {
      ctx.addIssue({
        path: ["target"],
        message: "El objetivo es requerido cuando el tipo es target",
        code: "custom",
      })
    }
  }
})

export type GoalSchema = z.infer<typeof goalSchema>
export type CreateGoalSchema = z.infer<typeof createGoalSchema>