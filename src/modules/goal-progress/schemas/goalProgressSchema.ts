import { z } from "zod"
import { dateSchema } from "../../../lib/dateSchemas"

/**
 * Schema para GoalProgress
 * IMPORTANTE: Todas las fechas se manejan en UTC
 * - createdAt, updatedAt: Date objects en UTC
 */
export const goalProgressSchema = z.object({
  id: z.uuid(),
  goalId: z.uuid(),
  progress: z.number().optional(),
  createdAt: dateSchema, // UTC Date
  updatedAt: dateSchema, // UTC Date
})

export const createGoalProgressSchema = goalProgressSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export type GoalProgress = z.infer<typeof goalProgressSchema>
export type CreateGoalProgress = z.infer<typeof createGoalProgressSchema>