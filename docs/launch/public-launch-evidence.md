# Public-launch evidence

- Branch: `agent/final-command-4-5-public-launch`
- Draft PR: https://github.com/Xroga/xroga.com/pull/356
- Candidate at document generation: `cb38638c3ee9a3b58d7e51b7b5464fc50c0d09bf`
- Supabase: `nzenxdfumxrnsmybazmo`
- Local lint: passed
- Resilience: 4/4
- Backend: 316/316
- Database URL: 3/3
- Backend TypeScript build: passed
- Frontend Next.js production build: passed, 66 routes
- Protected authentication and tenancy run: `30362121503`, passed
- Earlier main deployment evidence: web HTTP 200; Fly health and readiness HTTP 200; this is recovery evidence, not proof of the final candidate.

The final candidate cannot be called live until the merged commit is reported by both frontend `/api/release` and backend `/ready` and the protected production browser workflow passes.
