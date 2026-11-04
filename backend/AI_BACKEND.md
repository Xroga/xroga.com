# Xroga AI Backend (Converter → Builder)

## Stack (Fly.io secrets)

| Secret | Source | Models |
|---|---|---|
| `ZURELAY_API_KEY` | Zurelay (`api.zurelay.com/v1`) | **DeepSeek V4.1 Flash 1017** (default) and **Claude Sonnet 5.5** (task-bound escalation) |
| `XAI_API_KEY` | xAI official | Private Grok 4.3 native `x_search` retrieval only |
| `PARALLEL_API_KEY` | Parallel official | General public-web retrieval |

These are the only two executable text models. Kimi, GLM, Moonshot, Zhipu and OpenRouter routes are retired:
their ids remain in `models.ts` only as immutable accounting records and are denied before any credential,
reservation or request (`assertActiveModelId`). `DEEPSEEK_API_KEY` is not used. Grok is not part of the generic model router.

Monthly budget target: **$16.50** API / **$19** user charge / **~6.17M** tokens.

## Pipeline (no template catalogs)

1. User prompt
2. Optional research: Parallel for public web; Grok 4.3 `x_search` for X/Twitter only
3. **Converter** (DeepSeek V4.1 Flash 1017 via Zurelay) → detailed builder instruction
4. **Builder** (DeepSeek V4.1 Flash 1017 normally; Claude Sonnet 5.5 only with a task-bound spending grant)
5. Extract HTML/CSS/JS for preview, or return chat/research markdown

## HTTP

- `POST /api/phase1/chat` — light Q&A / research (409 `USE_BUILD_PIPELINE` for builds)
- `POST /api/swarm/execute` — SSE build stream (`start` → `progress` → `delta` → `complete`)
- `GET /api/phase1/usage` / `GET /api/dashboard/summary` — quota + `byModel` pools
