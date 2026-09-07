# Xroga AI Backend (Converter → Builder)

## Stack (Fly.io secrets)

| Secret | Source | Models |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter | **DeepSeek only** — `deepseek/deepseek-v4-flash` |
| `KIMI_API_KEY` | Moonshot official | Kimi K3 (`kimi-k3` @ `api.moonshot.ai`) |
| `GLM_API_KEY` | Zhipu / BigModel official | GLM-5.3 + GLM-5.3 Flash (`open.bigmodel.cn`) |
| `XAI_API_KEY` | xAI official | Private Grok 4.3 native `x_search` retrieval only |
| `PARALLEL_API_KEY` | Parallel official | General public-web retrieval |

**`DEEPSEEK_API_KEY` is not used.** DeepSeek runs only through OpenRouter.

Kimi and GLM are **not** routed through OpenRouter. Grok is not part of the generic model router.

Monthly budget target: **$16.50** API / **$19** user charge / **~6.17M** tokens.

## Pipeline (no template catalogs)

1. User prompt
2. Optional research: Parallel for public web; Grok 4.3 `x_search` for X/Twitter only
3. **Converter** (`deepseek/deepseek-v4-flash` via OpenRouter) → detailed builder instruction
4. **Builder** (GLM-5.3 Flash normally, GLM-5.3 for serious work, Kimi K3 for rare escalation)
5. Extract HTML/CSS/JS for preview, or return chat/research markdown

## HTTP

- `POST /api/phase1/chat` — light Q&A / research (409 `USE_BUILD_PIPELINE` for builds)
- `POST /api/swarm/execute` — SSE build stream (`start` → `progress` → `delta` → `complete`)
- `GET /api/phase1/usage` / `GET /api/dashboard/summary` — quota + `byModel` pools
