import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { image } = await req.json();

  const model =
    process.env.HF_UPSCALE_MODEL_HQ ||
    "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr";

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
      },
      body: Buffer.from(image, "base64"),
    }
  );

  const buffer = await response.arrayBuffer();

  return new NextResponse(buffer, {
    headers: { "Content-Type": "image/png" },
  });
}
