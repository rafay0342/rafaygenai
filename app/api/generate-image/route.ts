import { NextRequest, NextResponse } from "next/server";
import { getHFToken } from "@/lib/key-pool";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body.prompt || "";
    if (!prompt.trim()) {
      return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
    }

    const token = getHFToken("free")?.token || process.env.HF_TOKEN?.trim() || "";
    if (!token) {
      return NextResponse.json({ error: "HF token not configured." }, { status: 503 });
    }

    const model = body.model?.includes("/")
      ? body.model
      : "black-forest-labs/FLUX.1-schnell";

    const res = await fetch("https://api-inference.huggingface.co/models/" + model, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Image generation failed.", detail }, { status: res.status });
    }

    const img = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/png";
    return new NextResponse(img, { headers: { "Content-Type": contentType } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
