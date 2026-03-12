import sharp from "sharp";
import { requireAuth } from "@/lib/api-auth";


const DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188";
const MOCK_PREFIX = "mock-";
const DEFAULT_Z_IMAGE_API_BASE = "https://mcp-tools-z-image-turbo.hf.space";
const DEFAULT_FALLBACK_IMAGE_NAME = "generated-image";
const DEFAULT_IMAGE_WIDTH = 1024;
const DEFAULT_IMAGE_HEIGHT = 1024;

export const runtime = "nodejs";

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

function safeFilename(name: string | null | undefined, fallback: string) {
  const chosen = (name || fallback).trim();
  return chosen.replace(/[^\w.\-]+/g, "_").slice(0, 120) || fallback;
}

function filenameWithExt(baseName: string, ext: "jpg" | "svg") {
  const sanitized = safeFilename(baseName, DEFAULT_FALLBACK_IMAGE_NAME);
  const withoutExt = sanitized.replace(/\.[a-z0-9]+$/i, "");
  return `${withoutExt}.${ext}`;
}

function isRemoteHostAllowed(remote: URL) {
  const zImageHost = new URL(
    process.env.Z_IMAGE_API_BASE || DEFAULT_Z_IMAGE_API_BASE,
  ).hostname;
  const builtInAllowedHosts = [
    zImageHost,
    "replicate.delivery",
    "cdn.leonardo.ai",
    "videos.pexels.com",
    "player.vimeo.com",
    "fal.media",
    "huggingface.co",
    "hf.space",
  ];
  const allowlist = new Set(
    [...builtInAllowedHosts, ...(process.env.MEDIA_PROXY_ALLOWED_HOSTS || "").split(",")]
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  return remote.protocol === "https:" && allowlist.has(remote.hostname.toLowerCase());
}

function parseImageFormat(raw: string | null): "jpg" | "svg" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "jpg" || lower === "jpeg") return "jpg";
  if (lower === "svg") return "svg";
  return null;
}

async function convertImage(
  source: Buffer,
  format: "jpg" | "svg",
): Promise<{ body: Uint8Array; contentType: string; ext: "jpg" | "svg" }> {
  const pipeline = sharp(source, { animated: false, failOn: "none" });
  const metadata = await pipeline.metadata();
  const width = metadata.width || DEFAULT_IMAGE_WIDTH;
  const height = metadata.height || DEFAULT_IMAGE_HEIGHT;

  const jpg = await sharp(source, { animated: false, failOn: "none" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 97, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();

  if (format === "jpg") {
    return { body: new Uint8Array(jpg), contentType: "image/jpeg", ext: "jpg" };
  }

  const jpgBase64 = jpg.toString("base64");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="data:image/jpeg;base64,${jpgBase64}" width="${width}" height="${height}" />
</svg>`;
  return {
    body: new TextEncoder().encode(svg),
    contentType: "image/svg+xml; charset=utf-8",
    ext: "svg",
  };
}

async function forwardMediaResponse({
  upstream,
  format,
  download,
  downloadName,
}: {
  upstream: Response;
  format: "jpg" | "svg" | null;
  download: boolean;
  downloadName: string;
}) {
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: `Remote media error ${upstream.status}` },
      { status: 400 },
    );
  }

  if (!format) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        ...(download ? { "Content-Disposition": `attachment; filename="${downloadName}"` } : {}),
        "Cache-Control": "no-cache",
      },
    });
  }

  const source = Buffer.from(await upstream.arrayBuffer());
  const converted = await convertImage(source, format);
  const finalName = filenameWithExt(downloadName, converted.ext);
  const body = converted.body.buffer.slice(
    converted.body.byteOffset,
    converted.body.byteOffset + converted.body.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": converted.contentType,
      ...(download ? { "Content-Disposition": `attachment; filename="${finalName}"` } : {}),
      "Cache-Control": "no-cache",
    },
  });
}

export async function GET(req: Request) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const filename = url.searchParams.get("filename");
    const subfolder = url.searchParams.get("subfolder");
    const type = url.searchParams.get("type");
    const baseUrlParam = url.searchParams.get("baseUrl");
    const mockParam = url.searchParams.get("mock");
    const remoteUrl = url.searchParams.get("url");
    const download = url.searchParams.get("download") === "true";
    const format = parseImageFormat(url.searchParams.get("format"));
    const downloadName = safeFilename(
      url.searchParams.get("downloadName"),
      filename || "image.webp",
    );

    if (remoteUrl) {
      let parsedRemote: URL;
      try {
        parsedRemote = new URL(remoteUrl);
      } catch {
        return Response.json({ error: "Invalid remote url." }, { status: 400 });
      }
      if (!isRemoteHostAllowed(parsedRemote)) {
        return Response.json({ error: "Remote host is not allowed." }, { status: 400 });
      }

      const upstream = await fetch(parsedRemote.toString());
      return await forwardMediaResponse({
        upstream,
        format,
        download,
        downloadName,
      });
    }

    if (!filename) {
      return Response.json({ error: "Missing filename." }, { status: 400 });
    }

    const shouldMock =
      typeof mockParam === "string"
        ? mockParam === "true"
        : process.env.COMFYUI_MOCK === "true";

    if (shouldMock && filename.startsWith(MOCK_PREFIX)) {
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

    const baseUrl = baseUrlParam || process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_URL;
    const upstream = await fetch(`${baseUrl}/view?${params.toString()}`);

    if (!upstream.ok) {
      return Response.json({ error: `ComfyUI error ${upstream.status}` }, { status: 400 });
    }

    return await forwardMediaResponse({
      upstream,
      format,
      download,
      downloadName,
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
