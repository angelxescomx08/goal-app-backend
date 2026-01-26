import { Session } from "../../../lib/auth";
import { agent } from "../lib/agents";

export async function* chatController(context: {
  body: { message: { type: "user" | "assistant"; content: string } };
  session: Session["session"];
}) {
  const { body, session } = context;

  const input = {
    messages: [
      { role: "user", content: body.message.content }
    ]
  };

  const eventStream = agent.streamEvents(
    input,
    {
      version: "v2",
      configurable: {
        thread_id: session.userId,
        user_id: session.userId
      },
      context: {
        user_id: session.userId
      }
    }
  );

  for await (const event of eventStream) {
    if (event.event === "on_chat_model_stream") {
      const content = event.data.chunk.content;
      if (content) {
        yield JSON.stringify({ type: "text", content }) + "\n";
      }
    }
  }
}