Paid Grok-style console with Ollama, NextAuth, manual API keys, usage limits, and tools.

## Setup

### 1) Environment variables

Create a `.env.local` with:

```
DATABASE_URL="postgresql://user:password@localhost:5432/grok_console"
NEXTAUTH_SECRET="replace-with-strong-secret"
NEXTAUTH_URL="http://localhost:3000"
OLLAMA_BASE_URL="http://127.0.0.1:11434"
DAILY_MESSAGE_LIMIT="200"
MINUTE_MESSAGE_LIMIT="30"
ALLOW_COMMANDS="rg,ls,cat,pwd,node,npm"
COMFYUI_BASE_URL="http://127.0.0.1:8188"
COMFYUI_MOCK="true"
COMFYUI_IMAGE_WORKFLOW="{...}"
COMFYUI_VIDEO_WORKFLOW="{...}"
```

### 2) Database

```
npx prisma migrate dev --name init
```

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
- Tools: web fetch, file read, command exec (whitelisted).
- ComfyUI image + video generation endpoints.

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

Set `COMFYUI_MOCK="true"` to bypass ComfyUI and return placeholder media while you finish downloads.

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
