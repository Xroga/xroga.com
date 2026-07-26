# Webhook operations

Production billing webhooks fail closed when the signing secret is absent, verify signatures, claim a provider delivery ID in a unique server-only table, store only a payload digest, and return a truthful duplicate acknowledgement. Missing delivery infrastructure returns 503 instead of processing without idempotency.
