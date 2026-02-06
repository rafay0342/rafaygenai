import { requireAuth } from "@/lib/api-auth";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

export async function GET(req: Request) {
  try {
    await requireAuth(req);
    const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) {
      return Response.json(
        { error: `Ollama error ${response.status}` },
        { status: 400 },
      );
    }
    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const models = (data.models || []).map((model) => model.name);
    return Response.json({ models });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
