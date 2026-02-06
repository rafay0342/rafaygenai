import { requireAuth } from "@/lib/api-auth";
import { enforceLimits } from "@/lib/usage";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    await enforceLimits(auth.userId);

    const body = (await req.json()) as { text?: string; model?: string };
    if (!body.text) {
      return Response.json({ error: "Missing text." }, { status: 400 });
    }

    const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
    const model = body.model || "llama3.2:3b";

    const systemPrompt =
      "You are a strict transliteration engine. Convert Roman Urdu or Roman English to Urdu script when appropriate. If the input is already Urdu or standard English, return it unchanged. Output only the converted text, no explanations.";

    const upstream = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: body.text },
        ],
        stream: false,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return Response.json(
        { error: "Transliteration failed.", detail: errorText },
        { status: upstream.status },
      );
    }

    const data = (await upstream.json()) as { message?: { content?: string } };
    const output = data?.message?.content?.trim() || body.text.trim();
    return Response.json({ text: output });
  } catch (error) {
    const message = String(error);
    const status = message.includes("Unauthorized") ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
