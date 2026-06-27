# Paddle billing setup (Xroga)

Real checkout works once environment variables are set on **Fly.io** (API) and **Vercel** (frontend). **Never commit secrets to git** — add them only in each platform's dashboard.

## 1. Create products in Paddle

In [Paddle Dashboard](https://vendors.paddle.com) → **Catalog** → create a recurring price for each plan:

| Plan         | Price   | Actions/mo |
|--------------|---------|------------|
| Spark        | $19/mo  | 1,500      |
| Pulse        | $29/mo  | 5,000      |
| Nova         | $49/mo  | 10,000     |
| Zenith       | $99/mo  | 6,000      |
| Singularity  | $999/mo | 50,000     |

Copy each **Price ID** (`pri_...`).

## 2. Fly.io (backend API)

Project: `xroga-api` → **Secrets**:

```bash
PADDLE_API_KEY=pdl_live_apikey_...
PADDLE_WEBHOOK_SECRET=ntfset_...
PADDLE_VENDOR_ID=...
PADDLE_PRICE_SPARK=pri_...
PADDLE_PRICE_PULSE=pri_...
PADDLE_PRICE_NOVA=pri_...
PADDLE_PRICE_ZENITH=pri_...
PADDLE_PRICE_SINGULARITY=pri_...
```

Webhook URL (Paddle → Developer tools → Notifications):

```
https://xroga-api.fly.dev/api/billing/webhook/paddle
```

Subscribe to: `transaction.completed`, `subscription.created`.

## 3. Vercel (frontend)

Project settings → **Environment Variables**:

```
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=live_...
NEXT_PUBLIC_PADDLE_ENV=production
NEXT_PUBLIC_API_URL=https://xroga-api.fly.dev
```

Use `sandbox` + sandbox token while testing.

## 4. Verify

- `GET https://xroga-api.fly.dev/api/billing/plans` — each plan should show a `priceId`
- Log in → **Top Up Actions** → **BUY NOW** on any plan → Paddle checkout opens
- After payment, webhook applies actions to the user account

## Security

Do **not** paste API keys in chat or commit them to the repo. Use Fly/Vercel secret managers only.
