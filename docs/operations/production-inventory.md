# Production inventory

- Frontend: Vercel project `xrogaai.com` (`prj_OFS4CCMNe4dPFDpgdOtVUszg8vMv`), production alias `xroga.com`.
- API: Fly application `xroga-api`, primary region `iad`, minimum one machine.
- Database/auth/storage: Supabase, referenced by server-only environment variables; project identity and secrets intentionally omitted.
- Queue: BullMQ/Redis, optional at runtime; configuration presence is not reported as connectivity.
- Source/release: GitHub `Xroga/xroga.com`, main commit provenance flows into Vercel/Fly evidence.
- Billing webhooks: Lemon Squeezy at `/api/billing/webhook/lemon-squeezy`.

Dependencies: frontend → API → Supabase; API → AI/model providers, Redis when configured, GitHub/Vercel user integrations; billing provider → webhook → Supabase.
