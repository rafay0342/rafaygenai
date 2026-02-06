import { requireAuth } from "@/lib/api-auth";
import { enforceLimits } from "@/lib/usage";
import fs from "fs/promises";
import path from "path";

const MAX_BYTES = 80_000;

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    await enforceLimits(auth.userId);
    const body = (await req.json()) as { path?: string };
    if (!body.path) {
      return Response.json({ error: "Missing path." }, { status: 400 });
    }

    const base = process.cwd();
    const resolved = path.resolve(base, body.path);
    if (!resolved.startsWith(base)) {
      return Response.json({ error: "Path not allowed." }, { status: 403 });
    }

    const data = await fs.readFile(resolved, "utf8");
    const output = data.length > MAX_BYTES ? data.slice(0, MAX_BYTES) : data;
    return Response.json({ output });
  } catch (error) {
    const message = String(error);
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("limit") ? 429 : 500;
    return Response.json({ error: message }, { status });
  }
}
