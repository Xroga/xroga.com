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
