import { chatController } from "../controllers/chatControllers";
import z from "zod";
import { betterAuthMiddleware } from "../../../lib/auth";

export const chatRouter = betterAuthMiddleware.group("/chat", (group) =>
  group.post(
    "/",
    async (context) => {
      // Creamos un stream nativo
      const encoder = new TextEncoder();
      const generator = chatController(context);

      return new Response(
        new ReadableStream({
          async start(controller) {
            for await (const chunk of generator) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        }
      );
    },
    {
      auth: true,
      body: z.object({
        message: z.object({
          type: z.enum(["user", "assistant"]),
          content: z.string(),
        }),
      }),
    }
  )
);