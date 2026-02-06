type ComfyFile = {
  filename: string;
  subfolder?: string;
  type?: string;
  kind: "image" | "video" | "gif" | "unknown";
};

const DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188";

function buildWorkflow(raw: string, prompt: string) {
  const replaced = raw.replaceAll("{PROMPT}", prompt);
  return JSON.parse(replaced);
}

async function submitWorkflow(baseUrl: string, workflow: unknown) {
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!response.ok) {
    throw new Error(`ComfyUI error ${response.status}`);
  }
  const data = (await response.json()) as { prompt_id?: string };
  if (!data.prompt_id) {
    throw new Error("ComfyUI did not return prompt_id.");
  }
  return data.prompt_id;
}

async function pollHistory(baseUrl: string, promptId: string, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${baseUrl}/history/${promptId}`);
    if (response.ok) {
      const data = (await response.json()) as Record<string, any>;
      const entry = data[promptId];
      if (entry?.outputs) {
        return entry.outputs as Record<string, any>;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("ComfyUI timed out.");
}

async function findOutputsByPrompt(baseUrl: string, prompt: string) {
  const response = await fetch(`${baseUrl}/history`);
  if (!response.ok) return null;
  const data = (await response.json()) as Record<string, any>;
  let best: { createTime: number; outputs: Record<string, any> } | null = null;
  for (const entry of Object.values(data)) {
    const outputs = entry?.outputs;
    if (!outputs || Object.keys(outputs).length === 0) continue;
    const promptNodes = entry?.prompt?.[2];
    if (!promptNodes) continue;
    let matches = false;
    for (const node of Object.values(promptNodes)) {
      const text = (node as any)?.inputs?.text;
      if (typeof text === "string" && text.trim() === prompt.trim()) {
        matches = true;
        break;
      }
    }
    if (!matches) continue;
    const createTime = Number(entry?.prompt?.[3]?.create_time ?? 0);
    if (!best || createTime > best.createTime) {
      best = { createTime, outputs };
    }
  }
  return best?.outputs ?? null;
}

function extractFiles(outputs: Record<string, any>): ComfyFile[] {
  const files: ComfyFile[] = [];
  for (const key of Object.keys(outputs)) {
    const output = outputs[key];
    const addFiles = (items: any[], kind: ComfyFile["kind"]) => {
      items.forEach((item) => {
        if (item?.filename) {
          files.push({
            filename: item.filename,
            subfolder: item.subfolder,
            type: item.type,
            kind,
          });
        }
      });
    };

    if (Array.isArray(output?.images)) addFiles(output.images, "image");
    if (Array.isArray(output?.gifs)) addFiles(output.gifs, "gif");
    if (Array.isArray(output?.videos)) addFiles(output.videos, "video");
  }
  return files;
}

const MOCK_PREFIX = "mock-";

function buildMockFiles(mediaType: "image" | "video"): ComfyFile[] {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (mediaType === "video") {
    return [
      {
        filename: `${MOCK_PREFIX}video-${suffix}.svg`,
        kind: "gif",
        type: "image/svg+xml",
      },
    ];
  }
  return [
    {
      filename: `${MOCK_PREFIX}image-${suffix}.svg`,
      kind: "image",
      type: "image/svg+xml",
    },
  ];
}

export async function generateFromComfyUI({
  prompt,
  workflowEnv,
  mediaType,
}: {
  prompt: string;
  workflowEnv: string | undefined;
  mediaType: "image" | "video";
}) {
  if (process.env.COMFYUI_MOCK === "true") {
    return { promptId: "mock", files: buildMockFiles(mediaType) };
  }
  const baseUrl = process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_URL;
  if (!workflowEnv) {
    throw new Error("Missing ComfyUI workflow env.");
  }
  const workflow = buildWorkflow(workflowEnv, prompt);
  const promptId = await submitWorkflow(baseUrl, workflow);
  const outputs = await pollHistory(baseUrl, promptId);
  let files = extractFiles(outputs);
  if (files.length === 0) {
    const fallback = await findOutputsByPrompt(baseUrl, prompt);
    if (fallback) {
      files = extractFiles(fallback);
    }
  }
  return { promptId, files };
}

export function buildComfyViewUrl(file: ComfyFile) {
  const baseUrl = process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_URL;
  const params = new URLSearchParams();
  params.set("filename", file.filename);
  if (file.subfolder) params.set("subfolder", file.subfolder);
  if (file.type) params.set("type", file.type);
  return `${baseUrl}/view?${params.toString()}`;
}

export type { ComfyFile };
