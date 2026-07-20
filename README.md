# Xroga – AI Swarm Operating System

The world's first AI Swarm Operating System. 92 features, 100+ specialized AIs, and a Truth Council that ensures flawless execution.

## Architecture

```
xroga/
├── frontend/          # Next.js 14 (App Router) – Vercel
├── backend/           # Express API – Railway
├── supabase/          # Database migrations
└── package.json       # Monorepo root
```

### 5-Agent Swarm System

1. **Architect** – Plans the task
2. **Builder** – Creates the output
3. **Reviewer** – Finds 10–20 defects
4. **QA Tester** – Simulates execution
5. **Truth Council** – Final verification

The negotiation loop repeats until all agents confirm **Zero Defects**.

## Phase 1 (Complete)

- [x] Next.js 14 frontend with cosmic dark theme
- [x] Express backend API
- [x] Supabase schema with RLS policies
- [x] User auth (email, Google, GitHub, magic link)
- [x] BaseSwarm abstract class + negotiation loop
- [x] Action Meter (fuel system)
- [x] Dashboard shell with sidebar
- [x] Profile settings page

## Phase 2 (Complete)

- [x] Natural Language Command with feature routing (DeepSeek Architect)
- [x] SSE streaming progress (`POST /api/swarm/execute?stream=true`)
- [x] Landing Page Builder – Claude 3.5 + Flux Pro + Vercel deploy (25 Actions)
- [x] Image Generation – Agnes AI (primary), Fal/Replicate/Cloudflare fallback (4 Actions)
- [x] Browser Automation – Playwright (free local) + Browserbase fallback (5 Actions)
- [x] Cross-Post – Buffer / Twitter / LinkedIn APIs (1 Action/platform)
- [x] Auto-Key Creation – Browserbase + encrypted Supabase storage (5 Actions)

## Phase 3 (Complete)

- [x] Omni-Video Studio – Claude screenplay + parallel Agnes/Kling/Morph + FFmpeg + R2 (50 Actions/5s)
- [x] Deep Research – Exa + Tavily + Gemini PDF report (100 Actions)
- [x] Adult Content Blocker – Cloudflare DNS + ONNX config (`POST /api/wellbeing/protect`)
- [x] Auto Job Hunter – Apify + Claude resume + Browserbase apply (90 Actions)
- [x] Multi-Agent Debugging – DeepSeek-R1 + Claude + sandbox (`POST /api/debug/execute`)

## Phase 4 (Current)

- [x] Persistent sidebar with gradient active states + mini Action Meter
- [x] Mobile bottom navigation + collapsible drawer
- [x] Full dashboard with welcome, fuel meter, projects, activity feed, quick actions
- [x] Project detail view (chat + files + version history + previews)
- [x] GitHub OAuth integration UI with repo strategy
- [x] Settings page with tabs (General, Billing, Integrations, Security, Notifications)
- [x] Notification bell with unread count + SSE real-time Swarm progress

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase project
- (Optional) Upstash Redis for task queue

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
# Fill in your Supabase credentials

# Run Supabase migration
# Apply supabase/migrations/001_initial_schema.sql in Supabase SQL Editor

# Start dev servers
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/actions/balance` | Get action fuel balance |
| POST | `/api/actions/deduct` | Deduct actions for a task |
| POST | `/api/swarm/execute` | Run Swarm with feature routing (add `?stream=true` for SSE) |
| POST | `/api/chat` | Natural Language Command with SSE streaming |
| GET | `/api/projects` | List user projects |
| POST | `/api/projects` | Create a project |
| POST | `/api/debug/execute` | Multi-agent code debugging |
| POST | `/api/wellbeing/protect` | Enable content blocker |
| GET | `/api/projects/:id/files` | List project files from R2 |

## Roadmap

- **Phase 5**: Lemon Squeezy payments, pricing page, go-live

## License

Proprietary – Xroga AI
