# Replit Deploy (Separate From Hostinger)

This deploy is independent from Hostinger.  
Your existing `wavetechlimited.com` app keeps running as-is.

## 1) Create a new Replit project

1. Import this repo into a **new** Replit project.
2. Do not modify Hostinger server/domain settings.

## 2) Add environment variables in Replit Secrets

Copy from `replit.env.example` and set real values.

Minimum required:

- `DATABASE_URL=file:./dev.db`
- `NEXTAUTH_SECRET=<strong-random-secret>`
- `NEXTAUTH_URL=https://<your-replit-domain>`
- `NEXTAUTH_TRUST_HOST=true`
- `CHAT_PROVIDER=openai` (or your preferred provider)
- `OPENAI_API_KEY=<key>`
- `MEDIA_VIDEO_PROVIDER=leonardo`
- `LEONARDO_API_KEY=<key>`

Recommended for unlimited app usage:

- `UNLIMITED_MODE=true`
- `DAILY_MESSAGE_LIMIT=1000000000`
- `MINUTE_MESSAGE_LIMIT=1000000000`

## 3) Build/start commands (Replit Deployment)

Build command:

```bash
npm install && npm run replit:build
```

Run command:

```bash
npm run replit:start
```

The run script automatically:

- runs Prisma generate
- tries `prisma migrate deploy`
- starts Next.js on `0.0.0.0:$PORT`

## 4) Video generation behavior on Replit

- Replit usually won't run local ComfyUI GPU workflows.
- Keep `COMFYUI_*` unset unless you connect external Comfy.
- For fast/reliable video on Replit, use external providers:
  - `LEONARDO_API_KEY`
  - `PEXELS_API_KEY` fallback
  - `HF_TOKEN` fallback

## 5) Keep both apps running

- Hostinger production: unchanged (`wavetechlimited.com`)
- Replit app: separate URL/environment and separate secrets

No DNS/domain change is required unless you intentionally map a new custom domain to Replit.
