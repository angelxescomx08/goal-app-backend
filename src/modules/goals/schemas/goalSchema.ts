import { z } from "zod"

export const goalTypes = z.enum(["target", "manual", "goals"])

export const goalSchema = z.object({
  id: z.uuid(),
  parent_goal_id: z.uuid().nullish(),
  user_id: z.uuid(),
  unit_id: z.uuid().nullish(),
  title: z.string().min(1, "Título requerido"),
  goal_type: goalTypes,
  target: z.number().nullish(),
  description: z.string().min(1, "Descripción requerida"),
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
}).superRefine((data, ctx) => {
  if (data.goal_type === "target") {
    if (data.unit_id === null) {
      ctx.addIssue({
        path: ["unit_id"],
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