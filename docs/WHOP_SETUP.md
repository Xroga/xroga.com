# Whop billing (Xroga platform)

Xroga has two public plans: Free ($0, no card, 50 AI actions every 30 days) and Xroga Pro ($25 every 30 days, 1,500 AI actions). Paid checkout is hosted by Whop. Xroga grants paid access only after verifying a signed `payment.succeeded` webhook.

## Permanent configuration

- Account: `biz_qhYONL4RebGX96`
- Plan: `plan_hlV1A10I5QfSP`
- Redirect: `https://xroga.com/workspace?billing=success`
- Webhook: `https://xroga-api.fly.dev/api/billing/webhook/whop`
- API version date: `2026-09-06`

The approved Whop plan must be an active USD renewal plan priced at exactly $25 with a 30-day billing period and no trial. The API verifies that contract before creating a checkout.

## Server-only secrets

Set these as GitHub Actions repository secrets so the Fly deployment workflow can stage them without printing values:

- `WHOP_API_KEY`
- `WHOP_WEBHOOK_SECRET`

Never expose either value through a `NEXT_PUBLIC_` variable or commit it to source control.

## Webhook

Create one Whop v1 webhook for the Xroga account, point it at the endpoint above, and subscribe to:

- `payment.succeeded`
- `payment.failed`
- `membership.activated`
- `membership.cancel_at_period_end_changed`
- `membership.deactivated`
- `refund.created`
- `refund.updated`
- `dispute.created`
- `dispute.updated`

Store the webhook's one-time signing secret as `WHOP_WEBHOOK_SECRET`. Xroga verifies the Standard Webhooks headers against the exact raw request body, rejects stale timestamps, deduplicates delivery IDs durably, and refuses events for any other account or plan.

## Verification

After both secrets are configured and the backend redeployed:

1. Confirm `/api/billing/plans` exposes only Free and Xroga Pro.
2. Confirm an unsigned POST to `/api/billing/webhook/whop` is rejected.
3. Confirm an authenticated Pro checkout returns an approved `https://whop.com/...` purchase URL.
4. Use Whop's webhook test facility and confirm one signed `payment.succeeded` delivery activates Xroga Pro exactly once.
5. Do not perform a real charge as part of deployment verification.
