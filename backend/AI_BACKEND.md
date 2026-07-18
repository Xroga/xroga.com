# Xroga AI Backend (Converter → Builder)

## Stack (Fly.io secrets)

| Secret | Source | Models |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter | **DeepSeek only** — `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro` |
| `KIMI_API_KEY` | Moonshot official | Kimi K3 (`kimi-k3` @ `api.moonshot.ai`) |
| `GLM_API_KEY` | Zhipu / BigModel official | GLM-5.2 (`glm-5.2` @ `open.bigmodel.cn`) |
| `GROK_API_KEY` | xAI official | Grok 4.5 + 4.3 (`api.x.ai`) |
| `TAVILY_API_KEY` | Tavily official | Research gather (SearXNG free fallback) |

**`DEEPSEEK_API_KEY` is not used.** DeepSeek runs only through OpenRouter.

Kimi / GLM / Grok / Tavily are **not** routed through OpenRouter.

Monthly budget target: **$16.77** API / **$19** user charge / **~6.17M** tokens.

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
