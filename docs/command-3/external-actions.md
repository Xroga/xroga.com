# Command 3B external actions

One mandatory verification blocker remains:

1. Allow a non-production Vercel preview for PR #353 (the current deployment is skipped by the Ignored Build Step).
2. Configure that preview with its public Supabase URL/key and backend API URL. Do not provide service-role or database credentials to the browser.
3. Provide or sign in with a safe test account that belongs to an isolated test workspace.
4. Run the authenticated browser acceptance flow documented in `black-box-evidence.md`.

Optional provider operations remain truthfully unavailable until their mutation adapters and credentials are configured. This includes production rollback, database restore, cache purge, and provider-specific queue mutation. Their absence does not appear as success and does not expose a working UI control.

Existing Supabase advisor items outside this PR remain operator-owned: public avatar object listing and leaked-password protection configuration.
