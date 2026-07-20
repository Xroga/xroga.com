# Lemon Squeezy billing (Xroga platform)

Paddle has been removed. Subscriptions run through **Lemon Squeezy** as merchant of record.

## 1. Create products

In [Lemon Squeezy](https://app.lemonsqueezy.com) → Products, create a subscription product/variant for each plan:

| Plan | Env var | Variant ID |
|------|---------|------------|
| Spark ($19) | `LEMONSQUEEZY_VARIANT_SPARK` | from variant |
| Pulse ($29) | `LEMONSQUEEZY_VARIANT_PULSE` | |
| Nova ($49) | `LEMONSQUEEZY_VARIANT_NOVA` | |
| Zenith ($99) | `LEMONSQUEEZY_VARIANT_ZENITH` | |
| Singularity ($999) | `LEMONSQUEEZY_VARIANT_SINGULARITY` | |

Store ID: Settings → Stores → ID → `LEMONSQUEEZY_STORE_ID`

API key: Settings → API → `LEMONSQUEEZY_API_KEY`

## 2. Fly secrets

```bash
fly secrets set -a xroga-api \
  LEMONSQUEEZY_API_KEY="…" \
  LEMONSQUEEZY_STORE_ID="…" \
  LEMONSQUEEZY_WEBHOOK_SECRET="…" \
  LEMONSQUEEZY_VARIANT_SPARK="…" \
  LEMONSQUEEZY_VARIANT_PULSE="…" \
  LEMONSQUEEZY_VARIANT_NOVA="…" \
  LEMONSQUEEZY_VARIANT_ZENITH="…" \
  LEMONSQUEEZY_VARIANT_SINGULARITY="…" \
  LEMONSQUEEZY_REDIRECT_URL="https://xroga.com/dashboard/billing?checkout=success"
```

Remove old Paddle secrets if present (`PADDLE_*`).

## 3. Webhook

Dashboard → Settings → Webhooks → Add:

- URL: `https://xroga-api.fly.dev/api/billing/webhook/lemon-squeezy`
- Secret: same as `LEMONSQUEEZY_WEBHOOK_SECRET`
- Events: `subscription_created`, `subscription_updated`, `subscription_payment_success`, `order_created`, `subscription_cancelled`, `subscription_expired`

Checkout embeds `custom.user_id` + `custom.plan_tier` so webhooks upgrade the right Xroga account.

## 4. Frontend

No Lemon.js required — checkout redirects to hosted Lemon URL from the API.

## 5. User-generated apps (their billing)

Users who want subscriptions **in apps Xroga builds** save Lemon keys under Integrations (vault → Vercel env):

- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `LEMONSQUEEZY_VARIANT_ID` (default product)

Scaffolded Next apps can include `/api/checkout` + `/api/webhooks/lemon-squeezy` when billing is requested.
