import { requireAuth } from "@/lib/api-auth";
import { getMediaUsage } from "@/lib/plan-limits";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const usage = await getMediaUsage(auth.userId);
    return Response.json(usage);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 401 });
  }
}
