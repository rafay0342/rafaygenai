import { randomUUID } from "crypto";
import { getHFMediaToken } from "@/lib/hf-media-token";

const DEFAULT_WAN_API_BASE = "https://wan-ai-wan2-1.hf.space";

const WAN_DEFAULT_SIZE = process.env.WAN_SIZE || "1280*720";
const WAN_DEFAULT_WATERMARK = process.env.WAN_WATERMARK !== "false";

type WanVideoAsset = {
  url?: string;
  path?: string;
};

type WanDataEntry = {
  video?: WanVideoAsset;
  value?: { video?: WanVideoAsset };
};

type WanQueueMessage = {
  msg?: string;
  success?: boolean;
  output?: { data?: WanDataEntry[] };
};

export type WanPayload = {
  prompt: string;
  size?: string;
  seed?: number;
  watermark?: boolean;
  apiBase?: string;
};

function pickVideoUrl(apiBase: string, data?: WanDataEntry[]): string | null {
  if (!Array.isArray(data)) return null;
  const videoEntry = data.find((item) => item?.video);
  const valueEntry = data.find((item) => item?.value?.video);
  const video =
    videoEntry?.video ||
    valueEntry?.value?.video;
  return (
    video?.url ||
    (video?.path ? `${apiBase}/gradio_api/file=${video.path}` : null)
  );
}

function parseQueueData(raw: string) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  let lastCompleted: WanDataEntry[] | null = null;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as WanQueueMessage;
      if (msg?.msg === "process_completed") {
        if (msg.success === false) {
          throw new Error("Wan queue returned unsuccessful completion.");
        }
        if (Array.isArray(msg.output?.data)) {
          lastCompleted = msg.output?.data;
        }
      }
    } catch {
      // ignore malformed lines
    }
  }
  return lastCompleted;
}

async function callWanQueueV3({
  apiBase,
  fnIndex,
  data,
  sessionHash,
  authHeader,
}: {
  apiBase: string;
  fnIndex: number;
  data: unknown[];
  sessionHash: string;
  authHeader?: Record<string, string>;
}) {
  const joinResp = await fetch(`${apiBase}/gradio_api/queue/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authHeader || {}) },
    body: JSON.stringify({
      data,
      fn_index: fnIndex,
      session_hash: sessionHash,
    }),
  });
  if (!joinResp.ok) {
    const text = await joinResp.text();
    throw new Error(`Wan queue join failed ${joinResp.status}: ${text}`);
  }

  const dataResp = await fetch(
    `${apiBase}/gradio_api/queue/data?session_hash=${sessionHash}`,
    { headers: authHeader || undefined },
  );
  if (!dataResp.ok) {
    const text = await dataResp.text();
    throw new Error(`Wan queue data failed ${dataResp.status}: ${text}`);
  }
  const raw = await dataResp.text();
  const output = parseQueueData(raw);
  if (!output) {
    throw new Error("Wan queue did not return output data.");
  }
  return output;
}

export async function generateVideoViaWan({
  prompt,
  size = WAN_DEFAULT_SIZE,
  seed = -1,
  watermark = WAN_DEFAULT_WATERMARK,
  apiBase = process.env.WAN_API_BASE || DEFAULT_WAN_API_BASE,
}: WanPayload) {
  const mcpToken = getHFMediaToken();
  const authHeader = mcpToken ? { Authorization: `Bearer ${mcpToken}` } : undefined;

  const sessionHash = randomUUID().replace(/-/g, "");

  // Start text-to-video generation (fn_index 5 in Gradio config).
  await callWanQueueV3({
    apiBase,
    fnIndex: 5,
    data: [prompt, size, watermark, seed],
    sessionHash,
    authHeader,
  });

  let url: string | null = null;
  const started = Date.now();
  const timeoutMs = 300000;

  while (!url && Date.now() - started < timeoutMs) {
    // status_refresh (fn_index 7) returns: [video, cost, wait, progress]
    const statusOutputs = await callWanQueueV3({
      apiBase,
      fnIndex: 7,
      data: [null, null, null],
      sessionHash,
      authHeader,
    });
    url = pickVideoUrl(apiBase, [statusOutputs[0]]);
    if (!url) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (!url) {
    throw new Error("Wan response missing video url");
  }

  return {
    promptId: `wan-${Date.now()}`,
    files: [
      {
        filename: `wan-${Date.now()}.mp4`,
        kind: "video" as const,
        type: "video/mp4",
        url,
      },
    ],
  };
}
