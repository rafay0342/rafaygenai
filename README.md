Rafaygen Agent Live is a Next.js 16 production app for chat, media generation, auth, analytics, and internal tool workflows.

Current production preview stack:
- Next.js 16 + React 19
- PM2 process management
- Nginx reverse proxy
- Git push based server deploys
- Existing Hostinger VPS server with non-root `deploy` ownership for the new app

Long-term repository rules:
- Keep secrets in server-side env files, not Git.
- Do not commit generated screenshots, backup folders, runtime data dumps, or swap files.
- Use Node `24.x` to match the deployed runtime.
- Use the `deploy` SSH user for app pushes instead of root.

## Setup

### 1) Environment variables

Create a `.env.local` with:

```
DATABASE_URL="postgresql://user:password@localhost:5432/grok_console"
NEXTAUTH_SECRET="replace-with-strong-secret"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
NEXT_PUBLIC_SUPABASE_REALTIME_TABLE="VideoJob"
OLLAMA_BASE_URL="http://127.0.0.1:11434"
DAILY_MESSAGE_LIMIT="200"
MINUTE_MESSAGE_LIMIT="30"
ALLOW_COMMANDS="rg,ls,cat,pwd,node,npm"
COMFYUI_BASE_URL="http://127.0.0.1:8188"
COMFYUI_MOCK="true"
COMFYUI_IMAGE_WORKFLOW="{...}"
COMFYUI_VIDEO_WORKFLOW="{...}"
MEDIA_IMAGE_PROVIDER="zimage"
Z_IMAGE_ENABLED="true"
Z_IMAGE_API_BASE="https://mcp-tools-z-image-turbo.hf.space"
Z_IMAGE_RESOLUTION="1024x1024 ( 1:1 )"
Z_IMAGE_STEPS="8"
Z_IMAGE_SHIFT="3"
Z_IMAGE_RANDOM_SEED="true"
Z_IMAGE_TIMEOUT_MS="120000"
```

#### Persistence note (important)

If you use **SQLite**, do not keep the database file inside the app directory in production, because many deploy flows replace the app folder (and you'll "lose" users).

Use either:

- Managed Postgres (recommended): `DATABASE_URL="postgresql://..."`
- A persistent SQLite path outside the app folder, e.g. on Hostinger:
  - `DATABASE_URL="file:/home/<your_user>/rafaygen-data/rafaygen.sqlite"`

### 2) Database

```
npx prisma migrate dev --name init
```

### 2b) Supabase Realtime

Set `NEXT_PUBLIC_SUPABASE_REALTIME_TABLE` to the table you want to watch for realtime updates.
Use Supabase Storage for generated media assets if needed.

### 3) Create a user

```
node scripts/create-user.mjs you@example.com yourpassword
```

### 4) Run the app

```
npm run dev
```

Open http://localhost:3000 and sign in.

## Features

- NextAuth credentials login.
- Manual API key issuance per user.
- Daily usage limits enforced in `/api/chat`.
- Per-minute usage limits enforced in `/api/chat`.
- Ollama model discovery and streaming chat.
- Agent mode with NLP intent detection and safe built-in tool actions.
- Tools: web fetch, file read, command exec (whitelisted).
- ComfyUI image + video generation endpoints.
- Prompt-only instant image generation via Z-Image Turbo with automatic fallback.
- Groq-compatible moderation flow for image prompts and optional image URLs.

## API Usage

All endpoints require the auth header:

```
Authorization: Grok <PAID_API_KEY>
```

### Chat

```
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Grok YOUR_KEY" \
  -d '{
    "model": "llama3.1:8b",
    "messages": [{"role":"user","content":"Hello"}],
    "stream": true
  }'
```

### Image generation

```
curl -X POST http://localhost:3000/api/media/image \
  -H "Content-Type: application/json" \
  -H "Authorization: Grok YOUR_KEY" \
  -d '{"prompt":"A cinematic skyline at dusk"}'
```

By default, `/api/media/image` now tries providers in this order for reliability:
1) `google` (Gemini/Imagen via `GOOGLE_API_KEY`)
2) `zimage` (fast prompt-to-image fallback)
3) `hf` (if `HF_TOKEN` exists)

Image moderation is checked before generation when `MEDIA_IMAGE_MODERATION_ENABLED=true`.
Default moderation models:
- text moderation: `openai/gpt-oss-safeguard-20b`
- image-aware moderation: `meta-llama/llama-4-maverick-17b-128e-instruct`

### Media moderation

```
curl -X POST http://localhost:3000/api/media/moderation \
  -H "Content-Type: application/json" \
  -H "Authorization: Grok YOUR_KEY" \
  -d '{"prompt":"check this image prompt", "imageUrls":["https://example.com/sample.jpg"]}'
```

For Google image generation profiles:
- `GOOGLE_IMAGE_PROFILE=fast` -> fast image model preference
- `GOOGLE_IMAGE_PROFILE=thinking` -> higher reasoning-quality preference
- `GOOGLE_IMAGE_PROFILE=pro` -> pro-quality preference

If you have a Google consumer AI subscription plan, API access still requires a valid
Google AI Studio / Generative Language API key in `GOOGLE_API_KEY`.

### Video generation

```
curl -X POST http://localhost:3000/api/media/video \
  -H "Content-Type: application/json" \
  -H "Authorization: Grok YOUR_KEY" \
  -d '{"prompt":"A cinematic skyline at dusk"}'
```

### Media file fetch

Use the `filename`, `subfolder`, and `type` returned from image/video responses:

```
curl -X GET "http://localhost:3000/api/media/file?filename=...&subfolder=...&type=..." \
  -H "Authorization: Grok YOUR_KEY"
```

## Postman & JS client

- Postman collection: `postman_collection.json`
- JS client example: `examples/api-client.js`
- JS client env example: `examples/.env.example`

## Admin

Visit `/admin` as an admin user to manage limits and keys.

To promote a user to admin, update the database role field:

```
node scripts/promote-admin.mjs you@example.com
```

## ComfyUI

`COMFYUI_IMAGE_WORKFLOW` and `COMFYUI_VIDEO_WORKFLOW` should be JSON strings. Use `{PROMPT}` inside the workflow to insert the user prompt.  
You can now pass an optional `detailLevel` when calling the media APIs to push more refinement into the prompt before it reaches ComfyUI: `"standard"` (default), `"high"`, or `"ultra"`.

Set `COMFYUI_MOCK="true"` to bypass ComfyUI and return placeholder media while you finish downloads.

### Quick model setup (RealVisXL + SDXL VAE + 4x upscaler + SD1.5)

Run the helper to download the needed weights into your ComfyUI folder:

```
COMFY_HOME="$HOME/ComfyUI" HF_TOKEN=your_hf_token ./scripts/download-comfy-models.sh
```

- RealVisXL_V4.0.safetensors → `models/checkpoints`
- qwen_image_vae.safetensors → `models/vae`
- 4x-UltraSharp.pth → `models/upscale_models`
- v1-5-pruned-emaonly.safetensors (for sd15 video workflow) → `models/checkpoints`
- Qwen-Image-Edit-2509-Light-Migration.safetensors (LoRA for image) → `models/loras`

Restart ComfyUI after the download so it picks up the new weights.

Video workflows:
- `COMFYUI_VIDEO_WORKFLOW` (default) uses RealVisXL + SDXL refiner + 4x upscale.
- `COMFYUI_VIDEO_WORKFLOW_SD15` uses SD1.5 base + AnimateDiff motion module; pass `workflowVersion: "sd15"` in `/api/media/video` to use it. Optional `motionLora` can be provided once you have a SD1.5 motion LoRA path.

Example (minimal stub, replace with your real workflow):

```
COMFYUI_IMAGE_WORKFLOW="{\"3\":{\"class_type\":\"CLIPTextEncode\",\"inputs\":{\"text\":\"{PROMPT}\",\"clip\":[\"4\",0]}},\"4\":{\"class_type\":\"CLIPLoader\",\"inputs\":{\"clip_name\":\"clip_l.safetensors\"}},\"6\":{\"class_type\":\"KSampler\",\"inputs\":{\"model\":[\"7\",0],\"positive\":[\"3\",0],\"negative\":[\"5\",0],\"latent_image\":[\"8\",0]}},\"7\":{\"class_type\":\"CheckpointLoaderSimple\",\"inputs\":{\"ckpt_name\":\"sdxl.safetensors\"}},\"8\":{\"class_type\":\"EmptyLatentImage\",\"inputs\":{\"width\":1024,\"height\":1024,\"batch_size\":1}},\"9\":{\"class_type\":\"VAEDecode\",\"inputs\":{\"samples\":[\"6\",0],\"vae\":[\"7\",2]}},\"10\":{\"class_type\":\"SaveImage\",\"inputs\":{\"filename_prefix\":\"grok\",\"images\":[\"9\",0]}},\"5\":{\"class_type\":\"CLIPTextEncode\",\"inputs\":{\"text\":\"bad\",\"clip\":[\"4\",0]}}}"
```

## Notes

- For public hosting, keep `Server Proxy` mode and point `OLLAMA_BASE_URL` to your Ollama host.
- For browser-local usage, set `OLLAMA_ORIGINS` for the app origin on the Ollama host:
```
OLLAMA_ORIGINS="http://localhost:3000"
```

## Deploy

Set environment variables in your host, deploy, and keep your database + Ollama reachable.

### Replit (separate deployment)

If you want a second deployment on Replit while keeping Hostinger live, follow:

- `docs/replit-deploy.md`
