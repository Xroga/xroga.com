# Lemon Squeezy billing (Xroga platform)

Paddle has been removed. Xroga has one $19 per 30-day plan through Lemon Squeezy. The current launch environment deliberately uses Lemon Squeezy Test Mode: the published Spark subscription has a 30-day free trial, all payment data is dummy, and the initial charge is $0.

## 1. Create the product

In [Lemon Squeezy](https://app.lemonsqueezy.com), create one monthly subscription product and variant in Test Mode. Configure a 30-day free trial and keep `skip_trial` disabled:

| Plan | Environment variable | Value |
| --- | --- | --- |
| Xroga AI ($19) | `LEMONSQUEEZY_VARIANT_SPARK` | Variant ID |

Also record the store ID from Store settings and create an API key.

## 2. Configure Fly secrets

```bash
fly secrets set -a xroga-api \
  LEMONSQUEEZY_API_KEY="..." \
  LEMONSQUEEZY_STORE_ID="..." \
  LEMONSQUEEZY_WEBHOOK_SECRET="..." \
  LEMONSQUEEZY_VARIANT_SPARK="..." \
  LEMONSQUEEZY_REDIRECT_URL="https://xroga.com/dashboard/billing?checkout=success"
```

Set the non-secret runtime mode to `LEMONSQUEEZY_MODE=test`. Xroga includes `test_mode: true` when creating checkout and rejects a live webhook in a Test Mode runtime. Switching to live billing requires an explicit coordinated change to the API key, product/variant, webhook, signing secret, and runtime mode.

Remove obsolete `PADDLE_*` and historical multi-plan variant secrets if present.

## 3. Configure the webhook

Create a Lemon Squeezy webhook with:

- URL: `https://xroga-api.fly.dev/api/billing/webhook/lemon-squeezy`
- Secret: the same value stored as `LEMONSQUEEZY_WEBHOOK_SECRET`
- Events: `subscription_created`, `subscription_updated`, `subscription_payment_success`, `order_created`, `subscription_cancelled`, `subscription_expired`

Checkout includes `custom.user_id` and `custom.plan_tier`, and Xroga accepts capacity activation only after a valid signed and deduplicated provider event.

## 4. Checkout and customer portal

No Lemon.js is required. Checkout redirects to Lemon Squeezy's hosted checkout. Paid users open a fresh signed Customer Portal URL retrieved server-side from the Lemon Squeezy Customer API. Provider credentials and portal signatures are never committed.

## 5. User-generated products

The credentials a customer supplies for a generated product are separate from Xroga platform billing. They are stored in the customer's encrypted integration vault and synced only to the selected deployment environment.
