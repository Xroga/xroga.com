# Command 3 external actions

No mandatory implementation or verification blocker remains.

1. Review and merge draft PR #354 when satisfied; Codex did not merge it.
2. Configure Resend or Brevo server credentials and delivery webhooks only if email campaigns are required. Until then the API truthfully returns `external_setup_required`; in-app notifications remain supported.
3. Review pre-existing Supabase advisor notices for public avatar object listing and leaked-password protection. They were not introduced by Command 3C.
4. Confirm the Vercel production environment carries the approved public Supabase URL and publishable key before promoting the branch. Protected CI already verifies those GitHub secrets without exposing values.
