# Founder authorization and diagnostic boundary audit

## Gate and current result

`frontend/src/app/os-preview/founder/page.tsx` is dynamic, `force-no-store`, `revalidate = 0`, noindex, and calls the request-scoped `authorizeFounderRequest` before rendering its client tree. `frontend/src/lib/osFounderAccess.ts` requires: Supabase server `auth.getUser()`; normalized, confirmed `hello@xroga.com` email; a server RPC `current_community_role()` returning exactly `owner`; and current MFA assurance exactly `aal2`. Failure or provider error redirects to neutral `/os-preview/access-denied`. `frontend/src/lib/supabase/routeAccess.ts` also lists `/os-preview/founder` as protected; middleware is defense in depth, not the sole gate. The role RPC reads the server-owned `profiles.role` via `community_private.current_role()` in migration `20260729192159_community_platform.sql`; it does not authorize from client email or editable `user_metadata`.

The [Supabase MFA guidance](https://supabase.com/docs/guides/auth/auth-mfa) says AAL2 represents a second factor and requires enforcement in server/API/SSR, consistent with this route's fail-closed policy. The [getUser reference](https://supabase.com/docs/reference/javascript/auth-getuser) is the relevant server-validated identity API. We did **not** add a role, MFA enrollment shortcut, client toggle, bypass query or production diagnostic adapter.

## Existing API gap and scoped correction

`backend/src/middleware/admin.ts` allows `admin` **or** `owner`, not the single target founder. `/api/admin/errors` is under this middleware and can return `system_errors.error_message` and `metadata`; it is **not founder-exclusive or guaranteed redacted**. `/api/operations/readiness` was under global auth only, while its body can include `production_evidence` summaries/references. Command 3 adds existing `adminMiddleware` to that single readiness GET, preserving legitimate admin/owner access and denying ordinary signed-in roles. It does **not** make the endpoint founder-exclusive, so both APIs remain disconnected from `/os-preview/founder`.

| Case | Evidence | Result |
| --- | --- | --- |
| Signed out | `osFounderAccess.test.ts` and guest Playwright HTML/RSC requests | Denied; no founder fixture in response (browser run required for this commit) |
| Normal user | Pure server-dependency test | Denied before role read |
| Admin, wrong email | Pure server-dependency test | Denied before role read |
| Target email, no owner role | Pure server-dependency test | Denied |
| Target email, no AAL2 | Pure server-dependency test | Denied |
| Confirmed target + owner + AAL2 | Pure server-dependency test | Allowed by policy; **not** an authenticated deployed-founder browser test |
| Admin/owner readiness GET | Backend policy unit/source test | Existing roles preserved; live API integration test unavailable without isolated TEST identity |
| Direct `/api/admin/errors`/readiness as real identities | Not run against production | **Blocked**; no service-role credentials or fixture users used on production |
| Founder page SSR/RSC as real authorized identity | No isolated AAL2 owner test account | **Blocked**, not bypassed |

The Scenario Lab imports only fictional `osFounderLab.ts` fixtures after the server gate. Public `osCommand2.ts` no longer exports founder fixtures. The lab stores only fixed, non-sensitive review labels in a separate founder-browser namespace. It never fetches real admin APIs or serializes raw errors. Public preview network tests reject operational calls. Build-generated public bundle scans and deployed guest probes are recorded in `RELEASE_REVIEW.md` when complete.

## Required next security work before live diagnostics

Create a separate read-only endpoint with independent server authorization for confirmed `hello@xroga.com` + `owner` + AAL2, enforce tenant scope and redaction before serialization, no-store response, bounded filters/pagination and an access audit. Prove failure cases with dedicated isolated TEST identities, then test HTML/RSC and direct API access. A hidden link or the current broad admin policy is not sufficient. Until then, the displayed state must remain `INTEGRATION PENDING`.
