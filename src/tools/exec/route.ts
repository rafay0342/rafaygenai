import { requireAuth } from "@/lib/api-auth";
import { enforceLimits } from "@/lib/usage";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DEFAULT_ALLOW = ["rg", "ls", "cat", "pwd", "node", "npm"];

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    await enforceLimits(auth.userId);
    const body = (await req.json()) as { command?: string };
    if (!body.command) {
      return Response.json({ error: "Missing command." }, { status: 400 });
    }

    const parts = body.command.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    const allowList = new Set([
      ...DEFAULT_ALLOW,
      ...((process.env.ALLOW_COMMANDS || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)),
    ]);

    if (!allowList.has(command)) {
      return Response.json(
        { error: "Command not allowed." },
        { status: 403 },
      );
    }

    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 8000,
      maxBuffer: 120_000,
    });

    return Response.json({ output: [stdout, stderr].filter(Boolean).join("\n") });
  } catch (error) {
    const message = String(error);
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("limit") ? 429 : 500;
    return Response.json({ error: message }, { status });
  }
}
