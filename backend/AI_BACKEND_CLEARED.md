# Legacy AI backend cleared

The previous AI stack has been removed from this API:

- Phase 1 engine (DeepSeek / Claude / Grok routing)
- Swarm negotiation (Groq / DeepSeek / Grok prompts + pipeline)
- Provider clients (deepseek, groq, grok, anthropic)
- Token meters, model quota trackers, XRG earn/distribution
- Analytics, community, marketplace, influencer, automation, media, web-search

Retired HTTP surfaces now return `410` with code `AI_BACKEND_RETIRED`.

**Kept:** auth, GitHub, Vercel, billing/checkout, profile, projects, terminal sessions, notifications.

Mount the new AI backend here in the next update.
