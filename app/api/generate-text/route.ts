import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const prompt = body.prompt || "";

  return NextResponse.json({
    type: "text",
    prompt
  });
}
