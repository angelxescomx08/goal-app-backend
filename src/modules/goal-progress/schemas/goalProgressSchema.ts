import { z } from "zod"
import { dateSchema } from "../../../lib/dateSchemas"

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

export const listGoalProgressQuerySchema = z.object({
  goalId: z.string().uuid(),
})

export const updateGoalProgressSchema = z.object({
  progress: z.number().positive(),
})

export type GoalProgress = z.infer<typeof goalProgressSchema>
export type CreateGoalProgress = z.infer<typeof createGoalProgressSchema>
export type UpdateGoalProgress = z.infer<typeof updateGoalProgressSchema>