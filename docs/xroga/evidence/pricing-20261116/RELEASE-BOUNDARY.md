# Pricing-only release boundary — 2026-11-16

## Exact live production baseline

- Production site: https://xroga.com/pricing
- Verified prior Vercel production deployment: `dpl_Ax18grT6cjNkMqMSZXytSnvYDWze`
- Exact previous production source SHA: `36c2826bb07bb7058aca5c9dfba32c1a4386f0d8`
- Immutable PR base branch: `release/live-frozen-base-20261116`
- This release is not based on stale `main`; `main` was hundreds of commits behind the live production deployment.

## Scope

Exactly five application files changed relative to the deployed source:

1. `frontend/src/app/pricing/page.tsx`
2. `frontend/src/components/pricing/PricingPageClient.tsx`
3. `frontend/src/components/pricing/PricingPage.module.css`
4. `frontend/src/components/pricing/PricingCheckoutButton.tsx` (new, pricing-only)
5. `frontend/src/components/pricing/PricingCheckoutButton.module.css` (new, pricing-only)

The globally shared `frontend/src/components/billing/CheckoutButton.tsx` is unchanged; its dashboard/upgrade/subscription callers are not affected. No backend, database migration, permission policy, payment provider configuration, model routing, navigation, or other frontend page changed. The developer-owned plan price remains $25/month.

Additional changed repository files are generated source-bound inventory, existing false-positive review metadata and this nonruntime release note. These are audit evidence, not runtime feature changes.

## Exact re-review

The previous live pricing source SHA-256 `06dc256ae10249978f8b73114f455a3b4a518d39287cd08dd229810ab66875c5` and native `Array.from` call ID `e75e25572d006aea3011` were reproduced from the live source with the same scanner formula (`path:nodeStart:nodeEnd:kind`). The only change to that expression is its position in the source file: the expression is byte-identical and continues to render in-memory JSX particles in `CtaParticles`, not persistence. New source SHA-256 `c847f163d80335d0382133cb32ad6e4fef9dbbe0914e937e32572966947fc995` and scanner call ID `57613ffc9f4546d50dda` are bound in the existing review registry. Historical review provenance is retained in the record.

## Regenerated audit inventories

CI workflow `Pricing source-bound inventory diagnostic` ran from exact source commit `25acd4eaabcd422b7306b0fed437ec049cc9b8d7` (not from the diagnostic workflow tree). Its `inventory.mjs --refresh`, `inventory.mjs --check`, `audit-egress-callers.mjs --write`, and `audit-egress-callers.mjs` commands passed. Generated JSON and Markdown were copied by Git blob identity into this release branch. No user data, token, secret or SQL change was involved.

## Before release

- Verify frontend/Next.js build, all applicable CI tests, and the exact Vercel deployment source SHA.
- Smoke-test the pricing view/search/accordion on mobile and desktop. Do not perform a real card charge.
- Keep the existing provider-validated checkout destination and explicit user confirmation.
- Use a production-scope Vercel build; preview may use different environment variables.
- Keep the prior production deployment for immediate rollback. Verify `xroga.com` alias points to the new deployment and observe live pricing after promotion.

A successful build or checked-in evidence is not proof the live site was updated. No production update is claimed by this note.
