# Xroga Community

## Routes

- `/community`: public cursor-paginated feed and authenticated post modal.
- `/community/[postId]`: public visible post, votes, and replies.
- `/admin/community`: server-protected moderation dashboard for moderator, admin, and owner roles.

## Storage and migration

Migration `20260729192159_community_platform.sql` creates or secures `profiles`, `community_posts`, `community_comments`, `community_votes`, and private `community_admin_notes`. Apply it using the repository's protected Supabase migration workflow or `supabase db push` after linking the approved project. Never paste database credentials into a browser or commit them.

The browser uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`/publishable key only. The backend requires server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Existing deployment configuration also controls the backend API origin.

## Security model

RLS permits anonymous reads of non-hidden posts, comments, and public profile columns. Authenticated users may write only as `auth.uid()`. Database triggers reject author spoofing, member moderation, role changes, and fake official identities. Staff can moderate; only admin and owner can permanently delete through the interface. Admin notes have no public policy and are never selected by public endpoints. Server validation mirrors database length and enum constraints, and mutations are rate limited.

## Development and tests

Run the frontend and backend using the repository scripts, apply migrations to an isolated Supabase project, then run backend tests, frontend typecheck/build, and browser checks. Test anonymous visibility, hidden-content denial, author spoofing, official identity denial, duplicate votes, locked replies, member admin denial, staff moderation, keyboard focus trapping, and secret leakage.

## Deployment checklist

1. Review and apply the migration to the correct Supabase project.
2. Verify tables, constraints, indexes, triggers, grants, RLS, and policies independently.
3. Promote the first owner using `OWNER_SETUP.md`.
4. Build backend and frontend; deploy through existing workflows.
5. Verify anonymous feed, authenticated post/reply/vote, cross-user controls, staff dashboard, hidden-content denial, and private notes in production.

Public community responses intentionally contain only safe author identity, post/comment content, status, and counts. Private administrative notes and role-management data are accessible only through protected staff paths.
