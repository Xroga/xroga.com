# External actions

Before certification:

1. Review and approve draft PR 356 after all current checks are green.
2. Merge only through GitHub; do not bypass required checks.
3. Confirm the main Supabase, Fly, and Vercel workflows complete for the merge commit.
4. Run `Production launch browser verification` from the merged main commit.
5. If the authenticated checkout gate reports external setup required, configure the four server-side Fly secrets listed in `docs/LEMONSQUEEZY_SETUP.md` and the Lemon Squeezy webhook, then rerun once.

No credential value belongs in GitHub artifacts, logs, documentation, frontend variables, or source control.
