# Rafaygen Agent Live Deploy

## Endpoints
- Preview URL: http://72.62.1.63
- Existing live domain remains on the separate `rafaygen` PM2 app.

## Server paths
- App: `/opt/rafaygen-agent-live`
- Bare Git remote: `/opt/git/rafaygen-agent-live.git`
- Nginx site: `/etc/nginx/sites-enabled/rafaygen-agent-ip.conf`
- PM2 app: `rafaygen-agent-live`
- PM2 boot service: `pm2-deploy.service`
- Deploy user: `deploy`
- Node version: `24.x` from `.nvmrc`

## Push-based deploy
```bash
git clone deploy@72.62.1.63:/opt/git/rafaygen-agent-live.git
cd rafaygen-agent-live
# make changes
git add .
git commit -m "Your change"
git push origin main
```

A push to `main` automatically builds the app and reloads PM2.

## Current Hostinger VPS model
- This app now runs as the non-root `deploy` user on the existing VPS.
- The existing `/opt/rafaygen-llm-studio-Hostinger` app remains separate and continues serving the current domain stack.
- Nginx stays root-managed, but application deploys no longer require root access.

## Local deploy script
```bash
npm run deploy:local
```

This script builds the app, reloads PM2 with `ecosystem.config.cjs`, and verifies the local health check on `127.0.0.1:5001`.

## Long-term repo rules
- Keep secrets only in the server-side `.env.local`.
- Do not commit generated screenshots, backup folders, temp SCSS dumps, or runtime analytics files.
- Keep dependency changes synchronized with `package-lock.json`.
- Prefer pushing to Git and letting the server hook rebuild instead of editing files directly on the server.
- Runtime deploy state lives in `.deploy/` and should not be committed.

## Notes
- This preview currently serves over HTTP on the server IP.
- Secrets are loaded from the server-side `.env.local` copied from the existing app.
- For a dedicated domain, update `NEXT_PUBLIC_SITE_URL` and `NEXTAUTH_URL` in `/opt/rafaygen-agent-live/.env.local` and add a matching Nginx server block.

## Hostinger Node.js Hosting (hPanel)

Use Hostinger hPanel Node.js Web Apps hosting for managed Node deployments.

1. Create a Node.js app in hPanel and select the Node.js version.
<<< saas-ui-supabase-hostinger
2. Set the app start command to `npm run hostinger:start`.
=======
2. Set the app start command to `npm run start`.
>>> main
3. Deploy with Git integration by connecting the GitHub repo.
4. Copy the auto-deploy webhook URL from hPanel and set it as the GitHub secret `HOSTINGER_DEPLOY_WEBHOOK`.
5. GitHub Actions will trigger the webhook on pushes to `main`.

Notes:
- If your Hostinger plan does not allow the required Node version, use VPS hosting instead.
- Keep env vars in Hostinger hPanel environment settings.
