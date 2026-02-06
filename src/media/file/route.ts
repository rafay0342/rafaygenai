import { requireAuth } from "@/lib/api-auth";

const DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188";
const MOCK_PREFIX = "mock-";

function buildMockSvg(label: string) {
  const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576" viewBox="0 0 1024 576">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0b12"/>
      <stop offset="100%" stop-color="#1b1c26"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="576" fill="url(#bg)"/>
  <rect x="64" y="64" width="896" height="448" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <text x="512" y="288" fill="#f5d76b" font-size="36" font-family="Arial, sans-serif" text-anchor="middle">
    ${safeLabel}
  </text>
  <text x="512" y="336" fill="rgba(255,255,255,0.6)" font-size="16" font-family="Arial, sans-serif" text-anchor="middle">
    Mock ComfyUI output
  </text>
</svg>`;
}

export async function GET(req: Request) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const filename = url.searchParams.get("filename");
    const subfolder = url.searchParams.get("subfolder");
    const type = url.searchParams.get("type");

    if (!filename) {
      return Response.json({ error: "Missing filename." }, { status: 400 });
    }

    if (process.env.COMFYUI_MOCK === "true" && filename.startsWith(MOCK_PREFIX)) {
      const isVideo = filename.includes("video");
      const svg = buildMockSvg(isVideo ? "Mock video preview" : "Mock image preview");
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "no-cache",
        },
      });
    }

    const params = new URLSearchParams();
    params.set("filename", filename);
    if (subfolder) params.set("subfolder", subfolder);
    if (type) params.set("type", type);

    const baseUrl = process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_URL;
    const upstream = await fetch(`${baseUrl}/view?${params.toString()}`);

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: `ComfyUI error ${upstream.status}` },
        { status: 400 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
