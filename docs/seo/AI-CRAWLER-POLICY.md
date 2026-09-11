# AI crawler policy

Reviewed: September 11, 2026. Machine-readable registry: `scripts/seo-crawlers.json`.

Public product, editorial, documentation, evidence, and tool pages are available to ordinary search crawlers, OAI-SearchBot, and PerplexityBot. API, workspace, dashboard, settings, admin, authentication, embedded preview, and terminal paths remain disallowed.

OpenAI documents OAI-SearchBot as the control for ChatGPT search inclusion and GPTBot as a separate foundation-model training crawler. ChatGPT-User is user initiated and robots rules may not apply. Source: https://developers.openai.com/api/docs/bots

Perplexity documents PerplexityBot for search indexing and Perplexity-User for user-initiated retrieval; its user agent may ignore robots rules. Source: https://docs.perplexity.ai/docs/resources/perplexity-crawlers

The current wildcard policy permits GPTBot on public pages. Changing training-crawler policy is a product/legal decision and must not be coupled silently to search-inclusion changes. Crawler names, IP ranges, and behavior must be rechecked from official documentation before firewall allowlisting.
