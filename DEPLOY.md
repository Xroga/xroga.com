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

## Supabase OAuth (user connect — authorize, no paste)
Create an OAuth App in your Supabase org → OAuth Apps.

Callback URL (exact):
`https://xroga.com/dashboard/integrations/supabase/callback`

Fly secrets:
```bash
fly secrets set -a xroga-api \
  SUPABASE_OAUTH_CLIENT_ID="from_supabase_oauth_app" \
  SUPABASE_OAUTH_CLIENT_SECRET="from_supabase_oauth_app" \
  SUPABASE_OAUTH_CALLBACK_URL="https://xroga.com/dashboard/integrations/supabase/callback"
```

After authorize, Xroga lists projects, fetches keys, and auto-runs SQL (schema + AI memory + storage) on the user's project.

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
  OPENROUTER_API_KEY="..." \
  KIMI_API_KEY="..." \
  GLM_API_KEY="..." \
  GROK_API_KEY="..." \
  TAVILY_API_KEY="..." \
  FAL_API_KEY="..." \
  REPLICATE_API_TOKEN="..." \
  AGNES_API_KEY="..."
```

AI stack notes:
- **DeepSeek V4 Flash/Pro** → OpenRouter only (`deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`) via `OPENROUTER_API_KEY`
- **Kimi K3** → official Moonshot `KIMI_API_KEY` (not OpenRouter)
- **GLM-5.2** → official Zhipu `GLM_API_KEY` (not OpenRouter)
- **Grok** → official xAI `GROK_API_KEY` (not OpenRouter)
- **Tavily** → official `TAVILY_API_KEY`
- Do **not** set `DEEPSEEK_API_KEY` — it is unused

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

### GitHub Actions (auto on merge to `main`)

Add these **GitHub repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|--------|-----------------|
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → **Database** → Database password |
| `SUPABASE_URL` | `https://mweinwhoekwjrecsodip.supabase.co` (your project URL) |

Optional: `DATABASE_URL` (full Postgres URI) instead of the two above.

Optional: `SUPABASE_PROJECT_ID` = `mweinwhoekwjrecsodip` if you omit `SUPABASE_URL`.

**Note:** `SUPABASE_SERVICE_ROLE_KEY` (Fly.io / Vercel) is **not** the database password and cannot run migrations.

### Fly.io (auto-ensure on API startup)

Set the database password on Fly so the API creates missing tables on boot:

```bash
fly secrets set -a xroga-api \
  SUPABASE_DB_PASSWORD="your-database-password"
```

You already have `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on Fly — add `SUPABASE_DB_PASSWORD` for persistent token tracking.

### Manual options

Option A (CLI — needs Supabase access token):
```bash
supabase login
supabase link --project-ref mweinwhoekwjrecsodip
./scripts/supabase-db-push.sh
```

Option B (direct script — same as GitHub Actions):
```bash
SUPABASE_DB_PASSWORD="..." SUPABASE_URL="https://mweinwhoekwjrecsodip.supabase.co" \
  node scripts/apply-supabase-migrations.mjs
```

Option C (SQL Editor): paste contents of `supabase/migrations/*.sql` in order.

## Verify
```bash
curl https://xroga-api.fly.dev/health
# authConfigured: true, dbConfigured: true
```
