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

## Phase 2 (Current)

- [x] Natural Language Command with feature routing (DeepSeek Architect)
- [x] SSE streaming progress (`POST /api/swarm/execute?stream=true`)
- [x] Landing Page Builder – Claude 3.5 + Flux Pro + Vercel deploy (25 Actions)
- [x] Image Generation – Replicate Flux Pro + Cloudflare fallback (4 Actions)
- [x] Browser Automation – Playwright + Browserbase fallback (5 Actions)
- [x] Cross-Post – Buffer / Twitter / LinkedIn APIs (1 Action/platform)
- [x] Auto-Key Creation – Browserbase + encrypted Supabase storage (5 Actions)

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
| POST | `/api/swarm/execute` | Run 5-agent Swarm on a prompt |
| GET | `/api/projects` | List user projects |
| POST | `/api/projects` | Create a project |
| GET/PATCH | `/api/profile` | User profile |

## Roadmap

- **Phase 2**: Core features (NL command, landing page builder, image gen, browser automation)
- **Phase 3**: Premium features (Omni-Video, Deep Research, Job Hunter)
- **Phase 4**: Full dashboard, project detail view, GitHub integration
- **Phase 5**: Paddle payments, pricing page, go-live

## License

Proprietary – Xroga AI
