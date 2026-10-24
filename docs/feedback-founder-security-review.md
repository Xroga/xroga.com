# Feedback founder authorization, review only

Base main: 73b1555a0be8064160d603371db90b3dfeac3f92. Independent of accepted Phase 3 source and historical Phase 2 evidence. No production migration or credential change authorized.

Requirement: public feedback may be submitted by anonymous or authenticated callers, with identity supplied/bound by Supabase. Global review must require the existing canonical confirmed hello@xroga.com, server-owned owner role and AAL2 policy.

The route reuses authorizeFounderRequest and existing current_community_role/MFA assurance mechanisms. SQL independently checks current auth.users confirmation/email, profiles.role and signed AAL2. A restrictive read guard prevents another permissive policy from widening access. INSERT policies and existing rows are preserved. No user is promoted and no MFA configuration is changed.

Real Supabase test workflow reuses the exact previously verified disposable bootstrap at 9d6234af. It has no repository/environment secrets. Auth, MFA, signed JWTs, PostgREST and PostgreSQL are real. The minimal profiles table is an explicitly target-scoped fixture, not a claim of current-main full migration history or production schema parity. Both original and correction migrations are applied from this candidate's exact bytes. Upgrade and fresh cases retain a seeded row, test real caller/anonymous inserts, forged identity rejection, atomic mixed-batch rollback, foreign/anonymous/AAL1 reads, forbidden update/delete, legitimate MFA founder access and role/confirmation/email revocation. A deliberately broad SELECT policy tests the restrictive guard.

Rollout remains blocked for owner review. Before any authorized production application, verify through an approved read-only owner procedure that the real founder has a confirmed account, current owner role and enrolled MFA, and can satisfy AAL2. Do not print profile records, tokens or recovery codes. If any prerequisite is absent, stop rollout. Do not auto-promote users, bypass MFA, reset factors, or apply a migration to discover eligibility. Review an owner-assisted recovery path first.

Rollback must not restore email-only global reads. Reverting the UI alone leaves the database guard closed. On an unexpected legitimate denial, preserve the data and guard, pause rollout and use the reviewed founder recovery procedure. Do not grant service-role browser access or remove the restrictive policy as a troubleshooting shortcut.

Verification status belongs to authenticated CI receipts at the final candidate SHA, not planning markers. Full-source integrated acceptance on PR803 remains separate. No merge, deployment, spending or Phase 4.
