# Connected-app workflows

Xroga's connected-app path searches Composio's available tools and execution guidance at runtime. It does not hard-code a Gmail, Sheets, or other app action list. Supported operations remain limited by each provider API, connected account, OAuth scope, Xroga permission policy, and tool availability.

An explicit two-to-four-step request can run as a durable workflow. Reads complete first; each write is staged for individual review, with its exact tool and arguments shown before execution. Completed writes are not rolled back when a later step fails or is cancelled. Retrieved app content is evidence, never a new instruction or authorization.

The Automations → Scheduled Tasks screen can create paused interval or event rules. Enabling an interval rule sets its next run; the API polls due rules and claims each scheduled occurrence once. Event rules use a Composio trigger instance and a signed webhook. Every run is visible in Recent runs and links to its workflow status. Rules prepare actions for approval; they do not perform unattended external writes.

## Deployment prerequisites

1. Apply `supabase/migrations/20261024200940_connected_app_workflows.sql` before enabling the backend code. It stores workflow checkpoints, action results, rules, and deduplicated event delivery. The tables are service-role-only with RLS enabled. This migration has been applied to the production Xroga Supabase project.
2. Configure the existing server-side `COMPOSIO_API_KEY`. For event rules, register the project's webhook URL `https://xroga-api.fly.dev/api/integrations/composio/webhook` in Composio and set `COMPOSIO_WEBHOOK_SECRET` to its signing secret. Never put either secret in the frontend.
3. Connect the relevant user apps and confirm their OAuth scopes and action permissions. The trigger must belong to the connected toolkit. Use the app-event catalog in the rule form to pick a trigger slug and provide its required trigger configuration.
4. Manually verify a connected read, reviewed write, multi-step continuation, interval occurrence, signed event, invalid signature, duplicate event, pause/resume, and missing-connection path before deploying to users.

The webhook accepts only Composio V3 `composio.trigger.message` envelopes, verifies HMAC-SHA256 against the raw request body with a five-minute timestamp tolerance, and ignores unowned/disabled trigger instances. A failed run remains visible; it is not silently reported as completed.
