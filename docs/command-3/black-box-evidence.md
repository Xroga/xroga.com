# Command 3 black-box evidence

Protected browser run: https://github.com/Xroga/xroga.com/actions/runs/30250920431

- Approved Supabase project: `nzenxdfumxrnsmybazmo`; public URL and publishable key preflight passed without printing values.
- Real password login initially exposed disabled email authentication. The protected workflow enabled the required provider through the authenticated Supabase Management API and verified the setting.
- Real browser login passed; `/api/session` remained authenticated after refresh.
- `/dashboard/operations` loaded the temporary owner's durable project from the backend.
- The owner's product API returned 200; an unrelated tenant's product API returned 403.
- The real Settings security logout control cleared the session; `/api/session` returned 401.
- Temporary verified users and their cascading project fixtures were deleted in cleanup.
- The workflow artifact contains only redacted status evidence, project ref, HTTP results, and timestamps.
- Growth runtime tests prove invalid-event rejection, idempotency schema, meaningful activation, deterministic experiment assignment, insufficient-data results, operational blocker precedence, truthful provider states, server-key rejection, and private sitemap exclusion.
- Supabase queries independently verified growth RLS, revoked browser grants, server-only operational access, constraints, indexes, and migration records.
- Backend: 306/306 tests. Resilience: 4/4. Completion derivation: 4/4. Backend and frontend production builds passed.
