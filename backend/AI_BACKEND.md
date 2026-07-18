# Xroga AI Backend (Converter → Builder)

## Stack (Fly.io secrets)

| Secret | Models |
|---|---|
| `OPENROUTER_API_KEY` | **Kimi K3** (`moonshotai/kimi-k3`), **GLM-5.2** (`z-ai/glm-5.2`), **DeepSeek V4 Flash** (`deepseek/deepseek-v4-flash`), **DeepSeek V4 Pro** (`deepseek/deepseek-v4-pro`) |
| `GROK_API_KEY` | Grok 4.5 + 4.3 (`api.x.ai`) — falls back to OpenRouter `x-ai/grok-*` if missing |
| `TAVILY_API_KEY` | Research gather (SearXNG free fallback) |
| `KIMI_API_KEY` / `GLM_API_KEY` | Optional native fallbacks if OpenRouter is unset |

**`DEEPSEEK_API_KEY` is not used.** DeepSeek runs only through OpenRouter.

Monthly budget target: **$16.77** API / **$19** user charge / **~6.17M** tokens.

OpenRouter budgets should mirror the per-model USD caps (Kimi $8 / GLM $5.80 / DeepSeek $0.97).

## Pipeline (no template catalogs)

1. User prompt
2. Optional research: Tavily → SearXNG
3. **Converter** (`deepseek/deepseek-v4-flash` via OpenRouter) → detailed builder instruction
4. **Builder** (Kimi / GLM / DeepSeek Pro / Grok by router)
5. Extract HTML/CSS/JS for preview, or return chat/research markdown

## HTTP

- `POST /api/phase1/chat` — light Q&A / research (409 `USE_BUILD_PIPELINE` for builds)
- `POST /api/swarm/execute` — SSE build stream (`start` → `progress` → `delta` → `complete`)
- `GET /api/phase1/usage` / `GET /api/dashboard/summary` — quota + `byModel` pools

## Quotas

Uses `user_token_usage` (+ `increment_user_token_usage` / `merge_user_model_usage` RPCs) with in-memory fallback.
