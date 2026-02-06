import { enforceLimits } from "@/lib/usage";
import { requireAuth } from "@/lib/api-auth";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

type OllamaChatRequest = {
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
};

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    await enforceLimits(auth.userId);
    const body = (await req.json()) as OllamaChatRequest;
    const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;

    if (!body?.model || !body?.messages?.length) {
      return Response.json(
        { error: "Missing model or messages." },
        { status: 400 },
      );
    }

    const isStream = body.stream ?? true;
    const upstream = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        stream: isStream,
        options: body.options ?? {},
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return Response.json(
        {
          error: "Ollama request failed.",
          detail: errorText,
          status: upstream.status,
        },
        { status: upstream.status },
      );
    }

    if (!isStream) {
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "application/json",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const message = String(error);
    let status = 500;
    if (message.includes("Unauthorized")) status = 401;
    if (message.includes("Invalid API key")) status = 403;
    if (message.includes("Daily limit")) status = 429;
    if (message.includes("Minute limit")) status = 429;
    const detail =
      status === 500 ? "Unexpected server error." : message;
    return Response.json({ error: detail }, { status });
  }
}
