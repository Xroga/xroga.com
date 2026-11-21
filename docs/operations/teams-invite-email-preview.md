# Teams invitation email — isolated Preview only

## Admission

- Use the feature branch and this project's protected Vercel **Preview** environment. Do not change production aliases, the main branch, production Cloud Run or production Supabase.
- Verify the exact backend revision, isolated Supabase project, Vercel deployment and ordinary Paid fixture accounts before enabling mail. Never reuse an unrelated staging service's traffic or database without explicit scope.
- Mount the existing enabled version of `BREVO_API_KEY` as the Preview backend's server-only environment variable of the same name. Give the selected Preview revision's existing service account `roles/secretmanager.secretAccessor` on that one secret only. Do not read, copy or create a new key. Set `BREVO_SENDER_EMAIL` to an existing verified sender and `XROGA_TEAMS_INVITE_WEB_ORIGIN` to the exact Xroga Vercel Preview origin. The web origin must not be a production domain or a redirect.
- Configure the branch-specific Vercel Auth project and `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_XROGA_TEAMS_PREVIEW_API_ORIGIN` for the verified Preview deployment. Set `XROGA_TEAMS_PREVIEW_SUPABASE_ORIGIN` on its backend to the exact isolated database/Auth origin; it must match `SUPABASE_URL`.

## Behavior and verification

- A manager sends to the email of an existing confirmed Xroga account. The URL only opens the Teams drawer; it confers no rights. The signed-in recipient can accept only with their own active Paid plan and an unexpired pending invitation. Revoking a pending invitation prevents later acceptance even if an email was already sent.
- A database claim precedes the one-attempt Brevo REST request. Limits: 10 claims per acting manager per hour, 3 per recipient per day across teams, and 15 minutes between sends to a recipient for the same team. Resend is explicit and preserves the original seven-day expiry. A revoked or expired invitation requires a new invitation, subject to rate limits. Timeouts never trigger automated retries.
- HTTP 201 is provider acceptance only. Verify delivery in Brevo transactional logs or the authorized recipient inbox; then test acceptance and decline in independent Preview sessions, a duplicate-request race, expiry and revocation. Do not use real customers or a production credential-bearing browser trace.
- Roll back by disabling email configuration on the Preview revision; leave invitation records intact. An in-flight message cannot be recalled, but its invitation can be revoked.
