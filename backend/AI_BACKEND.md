# Xroga AI Backend (Converter → Builder)

## Stack (Fly.io secrets)

| Secret | Models |
|---|---|
| `KIMI_API_KEY` | Kimi K3 — flagship builder (`kimi-k3` @ Moonshot) |
| `GLM_API_KEY` | GLM-5.2 — long-horizon (`glm-5.2` @ BigModel) |
| `DEEPSEEK_API_KEY` | DeepSeek V4 Pro + Flash |
| `GROK_API_KEY` | Grok 4.5 + 4.3 (`api.x.ai`) |
| `TAVILY_API_KEY` | Research gather (SearXNG free fallback) |

Monthly budget target: **$16.77** API / **$19** user charge / **~6.17M** tokens.

## Pipeline (no template catalogs)

1. User prompt
2. Optional research: Tavily → SearXNG
3. **Converter** (`deepseek-v4-flash`) → detailed builder instruction
4. **Builder** (Kimi / GLM / DeepSeek Pro / Grok by router)
5. Extract HTML/CSS/JS for preview, or return chat/research markdown

## HTTP

- `POST /api/phase1/chat` — light Q&A / research (409 `USE_BUILD_PIPELINE` for builds)
- `POST /api/swarm/execute` — SSE build stream (`start` → `progress` → `delta` → `complete`)
- `GET /api/phase1/usage` / `GET /api/dashboard/summary` — quota + `byModel` pools

## Quotas

Uses `user_token_usage` (+ `increment_user_token_usage` / `merge_user_model_usage` RPCs) with in-memory fallback.
