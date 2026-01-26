import { createAgent, dynamicSystemPromptMiddleware } from "langchain";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createUnit, getGoals, getGoalsBetweenDates } from "./tools";

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GEMINI_API_KEY!
});

export const agent = createAgent({
  model,
  tools: [
    getGoals,
    getGoalsBetweenDates,
    createUnit,
  ],
  systemPrompt: "You are a helpful assistant that can help the user with their goals and units.",
  middleware: [
    dynamicSystemPromptMiddleware((state, config: { context: { user_id: string } }) => {
      const userId = config.context?.user_id;
      return `Eres un asistente personal. El ID del usuario actual es ${userId}.`;
    })
  ]
});