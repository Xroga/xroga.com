<p align="center">
  <a href="https://xroga.com">
    <img src="frontend/public/brand/xroga-mark-192.png" width="104" alt="Xroga AI logo" />
  </a>
</p>

<h1 align="center">XROGA AI</h1>

<p align="center"><strong>The Agentic Way to Build &amp; Ship.</strong></p>

<p align="center">
  Describe a software outcome in plain language. Xroga researches when needed, works in the connected repository, validates the result, repairs failures, and publishes only with real evidence.
</p>

<p align="center">
  <a href="https://xroga.com">Website</a> ·
  <a href="https://xroga.com/workspace">Workspace</a> ·
  <a href="https://xroga.com/showcase">Showcase</a> ·
  <a href="https://xroga.com/docs">Docs</a> ·
  <a href="https://xroga.com/pricing">Pricing</a> ·
  <a href="https://xroga.com/community">Community</a>
</p>

---

## What Xroga is

Xroga is an AI coding and product-building agent for developers and non-developers. It turns a requested outcome into reviewable work across one durable product thread:

```text
Understand → implement → validate → repair → push or publish when authorised
```

The product is designed around four operator signals:

| Signal | What it answers |
| --- | --- |
| **State** | What is happening, and what project context is active? |
| **Evidence** | Which files changed, which checks ran, and what actually happened? |
| **Permission** | Which account can act, and has the user authorised the operation? |
| **Blockers** | What exact risk, missing credential, failed check, or external step prevents completion? |

Xroga does not treat a plan, generated snippet, successful typecheck, or provider-created resource as a finished product. Completion requires the evidence appropriate to the requested outcome.

## The product loop

| Stage | Xroga’s responsibility |
| --- | --- |
| **Prompt** | Accept the outcome, constraints, repository, and attached context. |
| **Understand** | Inspect the relevant project state and identify the smallest credible implementation path. |
| **Build** | Create or update real project files while preserving unrelated work. |
| **Validate** | Run applicable syntax, import, lint, type, test, security, production-build, and browser checks. |
| **Repair** | Diagnose the first meaningful failure and make a focused correction instead of regenerating blindly. |
| **GitHub** | Create or update the selected repository and retain the branch, changed files, commit SHA, and push result. |
| **Preview and publish** | Show the working result and report a deployment only when a provider ID and reachable URL are verified. |

Follow-up prompts continue in the same project and repository, so an update changes the existing product instead of creating an orphan copy.

## What Xroga can work on

- Marketing websites, portfolios, blogs, directories, and content sites
- SaaS products, dashboards, admin tools, booking systems, and other full-stack web applications
- Existing repositories: features, bug fixes, redesigns, refactors, tests, and production repairs
- Browser games and interactive web experiences
- Chrome extensions using Manifest V3
- Electron desktop applications and release workflows
- Expo-based Android and iOS project scaffolds
- Crypto data and market dashboards without custody or automated trading
- Automation and agent-runner scaffolds

Support depends on the repository, configured providers, granted account permissions, and available runtime. When an external review or store submission is still required, Xroga keeps that boundary visible.

## Workspace

Workspace is the operating surface for the complete build thread. It keeps the prompt, selected repository, messages, files, execution events, preview, deployment result, and later updates together.

Current product surfaces include:

- Durable projects and numbered terminal sessions
- Repository-aware Files, Code, Changes, Terminal, Preview, and Deploy evidence
- Live execution updates over server-sent events
- Browser preview and responsive desktop/mobile workspace layouts
- Run history, usage visibility, notifications, settings, and project management
- Light, gray, dark, and beige presentation themes with accessibility preferences
- File and image attachments for project context

## Black Hole V∞

**Black Hole V∞** is the single Xroga intelligence presented to users. Xroga keeps provider and model selection internal, then routes work by capability—reasoning, repository engineering, high-volume execution, live research, or document understanding.

There is no vendor model picker in the product workflow. Operators judge the resulting state, evidence, permission, and blockers rather than an internal routing label.

## Integrations and ownership

### GitHub

GitHub is authorised through OAuth. Xroga can work only with repositories and permissions available to the connected account. Remote evidence includes the repository, branch, changed files, and commit SHA.

### Vercel

Web publishing supports two paths:

1. **Xroga-managed deployment** — available without asking the user to paste a personal Vercel token.
2. **User-authorised Vercel** — connect through OAuth, choose an accessible project, and use the user’s Vercel configuration when that ownership path is preferred.

A deployment is successful only when Xroga has a provider deployment ID and a publicly reachable application URL. Build success, deployment creation, and application readiness remain separate checks.

### Supabase

Supabase is optional. Through the authorised connection, Xroga can list or create projects, select a project, provision supported schema and storage, and synchronize the required public configuration. Private service credentials remain server-side.

### Other publishing credentials

Supported Expo, browser-extension, desktop-release, billing, and application-provider credentials are accepted through protected integration paths. Availability is reported honestly; adding a credential never proves that an external operation succeeded.

## Architecture

```text
Browser
  │
  ├── Next.js 15 frontend ─────────────── Vercel
  │        │
  │        └── Supabase Auth session
  │
  └── Express + TypeScript API ───────── Fly.io
           │
           ├── Supabase persistence
           ├── capability-routed AI execution
           ├── isolated Fly validation/browser sandbox
           └── authorised GitHub, Vercel, Supabase, and publishing operations
```

```text
xroga.com/
├── frontend/          # Next.js 15 App Router product and marketing surfaces
├── backend/           # Express API, orchestration, validation, integrations, billing
├── supabase/          # Database migrations and persistent product state
├── scripts/           # Verification, migration, and operational tooling
├── docs/              # Operator and implementation documentation
├── vercel.json        # Production frontend configuration
├── fly.api.toml       # Production API configuration
└── package.json       # npm workspaces entry point
```

## Local development

### Requirements

- Node.js 22
- npm

### Start the monorepo

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

For local frontend-to-API traffic, set this in `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Then run both workspaces:

```bash
npm run dev
```

| Service | Local address |
| --- | --- |
| Frontend | `http://localhost:3000` |
| API | `http://localhost:8080` |
| API health | `http://localhost:8080/health` |

The application can boot with placeholder local configuration. Real authentication, AI execution, persistence, and provider operations require their corresponding server-side configuration. Never commit real secrets.

## Verification

```bash
# Backend and frontend unit/regression suites
npm test

# Frontend lint
npm run lint

# Production builds
npm run build --workspace=backend
npm run build --workspace=frontend

# Focused resilience and SEO checks
npm run test:resilience
npm run test:seo
```

Production CI verifies the frontend build, unit suites, authenticated browser flows, and the Fly sandbox browser path. The API exposes safe release and readiness information at [xroga-api.fly.dev/health](https://xroga-api.fly.dev/health).

## Security and execution rules

- Browser code receives only public configuration; service-role keys and provider credentials stay server-side.
- Integration credentials are handled through protected paths and secret-like values are redacted from logs and user-facing evidence.
- Repository files, uploaded content, and research sources are treated as untrusted context—not instructions that can override platform security.
- Pushes, pull requests, merges, production deployments, domain changes, and store operations retain their distinct permission boundaries.
- Failed validation, unavailable providers, missing authorization, and unreachable deployments remain blockers; they are never converted into simulated success.
- Generated code is validated in an isolated runtime rather than inside the production API process.

See [DEPLOY.md](DEPLOY.md) for production configuration and [AGENTS.md](AGENTS.md) for repository-specific engineering guidance.

## Plan and access

Xroga currently presents one product plan with the complete feature set. Capacity, billing state, promotion eligibility, and reset timing are shown by the live product rather than frozen into this README. See [xroga.com/pricing](https://xroga.com/pricing) for the current offer.

---

<p align="center"><strong>Built with evidence. Ship with ownership.</strong></p>
