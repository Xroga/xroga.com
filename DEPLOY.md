# Production environment checklist

## Domains
- Frontend: https://xroga.com (Vercel)
- API: https://xroga-api.fly.dev (Fly.io)

## Supabase Auth settings
- **Site URL:** `https://xroga.com`
- **Redirect URLs:**
  - `https://xroga.com/auth/callback`
  - `https://xroga.com/**`
  - `https://www.xroga.com/auth/callback`

## Vercel environment variables
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=https://xroga-api.fly.dev
NEXT_PUBLIC_SITE_URL=https://xroga.com
```

## Fly.io secrets
```bash
./scripts/setup-fly-auth.sh \
  "https://YOUR_PROJECT.supabase.co" \
  "your-jwt-secret" \
  "your-service-role-key"
```

JWT Secret is in Supabase → Project Settings → API → JWT Settings.

## GitHub OAuth (user connect — not Fly URL)
GitHub OAuth App → Authorization callback URL (exact):
`https://xroga.com/dashboard/integrations/github/callback`

Fly secrets (required):
```bash
fly secrets set -a xroga-api \
  GITHUB_CLIENT_ID="from_github_oauth_app" \
  GITHUB_CLIENT_SECRET="from_github_oauth_app" \
  FRONTEND_URL="https://xroga.com" \
  GITHUB_OAUTH_CALLBACK_URL="https://xroga.com/dashboard/integrations/github/callback"
```

Remove unused: `GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN` (XROGA does not use it).

Verify after deploy:
```bash
curl https://xroga-api.fly.dev/health
# githubOAuthRedirectUri must be https://xroga.com/dashboard/integrations/github/callback
```

## Fly.io secrets (image generation)
`FLY_API_TOKEN` in GitHub **only deploys code** — it does **not** pass image API keys to Fly.

Set image keys directly on the Fly app:
```bash
fly secrets set -a xroga-api \
  FAL_API_KEY="..." \
  REPLICATE_API_TOKEN="..." \
  AGNES_API_KEY="..." \
  GROQ_API_KEY="..." \
  DEEPSEEK_API_KEY="..."
```

Verify the server sees your keys:
```bash
curl https://xroga-api.fly.dev/health
# imageReady: true, imageProviders: ["fal-sdxl","replicate-sd",...]
```

**ComfyUI** requires a separate running ComfyUI server and `COMFYUI_URL` — it is not automatic on Fly.

## GitHub auto-deploy (Fly)
Add repo secret `FLY_API_TOKEN`:
```bash
fly tokens create deploy -a xroga-api
```
Without this, GitHub deploys fail and Fly runs **old code** → "Authentication failed".

## Apply database migrations
Option A (CLI):
```bash
supabase login
supabase link --project-ref YOUR_REF
./scripts/supabase-db-push.sh
```

Option B (SQL Editor): paste contents of `supabase/migrations/*.sql` in order.

## Verify
```bash
curl https://xroga-api.fly.dev/health
# authConfigured: true, dbConfigured: true
```
