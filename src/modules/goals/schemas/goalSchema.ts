import { z } from "zod"

export const goalTypes = z.enum(["target", "manual", "goals"])

export const goalSchema = z.object({
  id: z.uuid(),
  parent_goal_id: z.uuid().nullish(),
  user_id: z.uuid(),
  unit_id: z.uuid().nullish(),
  title: z.string(),
  goal_type: goalTypes,
  target: z.number().nullish(),
  description: z.string(),
  completed_at: z.date().nullish(),
  created_at: z.date(),
  updated_at: z.date(),
})

export const createGoalSchema = goalSchema.omit({
  id: true,
  user_id: true,
  completed_at: true,
  created_at: true,
  updated_at: true,
})

export type GoalSchema = z.infer<typeof goalSchema>
export type CreateGoalSchema = z.infer<typeof createGoalSchema>