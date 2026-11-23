-- Xroga Team invitations: zero-cost, no email delivery.
-- Expand-only: new tables and service-only functions. No existing rows, columns,
-- grants or policies are changed. Not authorized for production until the isolated
-- staging, security and authenticated-browser gates pass (see AGENTS.md).
--
-- Authority model (INV-03/INV-05): the backend derives the actor from the verified
-- session and calls these SECURITY DEFINER functions with service_role only. Clients
-- never receive table grants, so a forged request cannot touch membership. Every
-- membership change, token check, permission check and limit is enforced here.
BEGIN;

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teams_owner ON public.teams(owner_id);

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  can_invite boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
-- Exactly one owner membership per team.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_one_owner ON public.team_members(team_id) WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('user','link')),
  invitee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  -- SHA-256 hex of the random token. The raw token is never stored.
  token_hash text UNIQUE CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  role text NOT NULL CHECK (role IN ('admin','member','viewer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked','exhausted')),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 100),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_invitation_shape CHECK (
    (kind = 'user' AND invitee_id IS NOT NULL AND token_hash IS NULL AND max_uses = 1)
    OR (kind = 'link' AND invitee_id IS NULL AND token_hash IS NOT NULL AND role <> 'admin')
  )
);
CREATE INDEX IF NOT EXISTS idx_team_invitations_team ON public.team_invitations(team_id, status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_invitee ON public.team_invitations(invitee_id) WHERE status = 'pending';
-- No duplicate pending invitation for the same person and team.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_pending_user_invite
  ON public.team_invitations(team_id, invitee_id) WHERE kind = 'user' AND status = 'pending';

-- One redemption per person per link, even if the link has remaining uses.
CREATE TABLE IF NOT EXISTS public.team_link_redemptions (
  invitation_id uuid NOT NULL REFERENCES public.team_invitations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invitation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.team_audit (
  id bigserial PRIMARY KEY,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_audit_team ON public.team_audit(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_audit_actor_action ON public.team_audit(actor_id, action, created_at DESC);

-- RLS on, and no direct access for client roles. All access is through the
-- service-only functions below, which re-check the actor on every call.
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_link_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teams, public.team_members, public.team_invitations,
  public.team_link_redemptions, public.team_audit FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.team_audit_id_seq FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams, public.team_members, public.team_invitations,
  public.team_link_redemptions, public.team_audit TO service_role;
GRANT USAGE ON SEQUENCE public.team_audit_id_seq TO service_role;

-- Member cap per team. Single place to later tie seats to a plan; there is no
-- seat-based billing in Xroga today, so this is a flat free-tier abuse cap.
CREATE OR REPLACE FUNCTION public.team_member_limit() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT 10 $$;

-- Internal: caller's membership row, locked, or an error.
CREATE OR REPLACE FUNCTION public.team_require_member(p_actor uuid, p_team uuid)
RETURNS public.team_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE m public.team_members%rowtype;
BEGIN
  SELECT * INTO m FROM public.team_members WHERE team_id = p_team AND user_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404'; END IF;
  RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.team_can_invite(m public.team_members) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT m.role IN ('owner','admin') OR m.can_invite
$$;

CREATE OR REPLACE FUNCTION public.team_audit_write(p_team uuid, p_actor uuid, p_action text, p_target uuid, p_detail jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO public.team_audit(team_id, actor_id, action, target_id, detail) VALUES (p_team, p_actor, p_action, p_target, COALESCE(p_detail, '{}'::jsonb))
$$;

-- Internal rate limit using the audit trail. Raises TEAM_RATE_LIMIT.
CREATE OR REPLACE FUNCTION public.team_rate_check(p_actor uuid, p_action text, p_max integer, p_window interval)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.team_audit WHERE actor_id = p_actor AND action = p_action AND created_at > now() - p_window;
  IF n >= p_max THEN RAISE EXCEPTION 'TEAM_RATE_LIMIT' USING ERRCODE = 'XT429'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.team_create(p_actor uuid, p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE t public.teams%rowtype; clean text := btrim(coalesce(p_name, ''));
BEGIN
  IF p_actor IS NULL OR char_length(clean) NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'TEAM_INVALID' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text, 11));
  IF (SELECT count(*) FROM public.teams WHERE owner_id = p_actor) >= 5 THEN RAISE EXCEPTION 'TEAM_LIMIT' USING ERRCODE = 'XT429'; END IF;
  INSERT INTO public.teams(owner_id, name) VALUES (p_actor, clean) RETURNING * INTO t;
  INSERT INTO public.team_members(team_id, user_id, role, can_invite) VALUES (t.id, p_actor, 'owner', true);
  PERFORM public.team_audit_write(t.id, p_actor, 'team_created', t.id, '{}'::jsonb);
  RETURN jsonb_build_object('id', t.id, 'name', t.name, 'role', 'owner');
END $$;

-- Teams the actor belongs to, plus invitations waiting for the actor.
CREATE OR REPLACE FUNCTION public.team_inbox(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'teams', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'role', m.role, 'canInvite', public.team_can_invite(m),
        'memberCount', (SELECT count(*) FROM public.team_members x WHERE x.team_id = t.id)) ORDER BY t.created_at)
      FROM public.team_members m JOIN public.teams t ON t.id = m.team_id WHERE m.user_id = p_actor), '[]'::jsonb),
    'invitations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'teamName', t.name, 'role', i.role, 'expiresAt', i.expires_at,
        'invitedBy', COALESCE(p.display_name, p.username, 'A teammate')) ORDER BY i.created_at DESC)
      FROM public.team_invitations i JOIN public.teams t ON t.id = i.team_id LEFT JOIN public.profiles p ON p.id = i.created_by
      WHERE i.kind = 'user' AND i.invitee_id = p_actor AND i.status = 'pending' AND i.expires_at > now()), '[]'::jsonb));
END $$;

-- Owner/admin/inviter view of one team.
CREATE OR REPLACE FUNCTION public.team_overview(p_actor uuid, p_team uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE m public.team_members%rowtype; t public.teams%rowtype; inviter boolean;
BEGIN
  m := public.team_require_member(p_actor, p_team);
  SELECT * INTO t FROM public.teams WHERE id = p_team;
  inviter := public.team_can_invite(m);
  RETURN jsonb_build_object(
    'team', jsonb_build_object('id', t.id, 'name', t.name, 'limit', public.team_member_limit()),
    'me', jsonb_build_object('role', m.role, 'canInvite', inviter),
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', x.user_id, 'role', x.role, 'canInvite', x.can_invite, 'joinedAt', x.joined_at,
        'username', p.username, 'displayName', p.display_name, 'avatarUrl', p.avatar_url) ORDER BY x.joined_at)
      FROM public.team_members x LEFT JOIN public.profiles p ON p.id = x.user_id WHERE x.team_id = p_team), '[]'::jsonb),
    'pending', CASE WHEN inviter THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'role', i.role, 'expiresAt', i.expires_at,
        'username', p.username, 'displayName', p.display_name) ORDER BY i.created_at DESC)
      FROM public.team_invitations i LEFT JOIN public.profiles p ON p.id = i.invitee_id
      WHERE i.team_id = p_team AND i.kind = 'user' AND i.status = 'pending' AND i.expires_at > now()), '[]'::jsonb) ELSE '[]'::jsonb END,
    'links', CASE WHEN inviter THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'role', i.role, 'expiresAt', i.expires_at,
        'maxUses', i.max_uses, 'useCount', i.use_count, 'createdAt', i.created_at) ORDER BY i.created_at DESC)
      FROM public.team_invitations i
      WHERE i.team_id = p_team AND i.kind = 'link' AND i.status = 'pending' AND i.expires_at > now()), '[]'::jsonb) ELSE '[]'::jsonb END);
END $$;

-- Find existing users. Username prefix (3+ chars) or an exact email. Returns only
-- public identity fields, never an email, and only to someone who can invite.
CREATE OR REPLACE FUNCTION public.team_search_users(p_actor uuid, p_team uuid, p_query text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE m public.team_members%rowtype; q text := lower(btrim(coalesce(p_query, ''))); result jsonb;
BEGIN
  m := public.team_require_member(p_actor, p_team);
  IF NOT public.team_can_invite(m) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF char_length(q) < 3 OR char_length(q) > 120 THEN RAISE EXCEPTION 'TEAM_INVALID' USING ERRCODE = '22023'; END IF;
  PERFORM public.team_rate_check(p_actor, 'search', 30, interval '1 minute');
  PERFORM public.team_audit_write(p_team, p_actor, 'search', NULL, '{}'::jsonb);
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO result FROM (
    SELECT jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatarUrl', p.avatar_url,
      'alreadyMember', EXISTS (SELECT 1 FROM public.team_members x WHERE x.team_id = p_team AND x.user_id = p.id)) AS r
    FROM public.profiles p
    WHERE p.id <> p_actor AND (
      (position('@' in q) = 0 AND lower(p.username) LIKE replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\')
      OR (position('@' in q) > 0 AND p.id IN (SELECT u.id FROM auth.users u WHERE lower(u.email) = q)))
    ORDER BY p.username LIMIT 5) s;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.team_invite_user(p_actor uuid, p_team uuid, p_target uuid, p_role text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE m public.team_members%rowtype; inv public.team_invitations%rowtype; team_name text;
BEGIN
  IF p_target IS NULL OR p_role NOT IN ('admin','member','viewer') THEN RAISE EXCEPTION 'TEAM_INVALID' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_team::text, 12));
  m := public.team_require_member(p_actor, p_team);
  IF NOT public.team_can_invite(m) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_role = 'admin' AND m.role <> 'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_target = p_actor THEN RAISE EXCEPTION 'TEAM_INVALID' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target) THEN RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404'; END IF;
  IF EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team AND user_id = p_target) THEN RAISE EXCEPTION 'TEAM_CONFLICT' USING ERRCODE = 'XT409'; END IF;
  IF (SELECT count(*) FROM public.team_members WHERE team_id = p_team)
     + (SELECT count(*) FROM public.team_invitations WHERE team_id = p_team AND kind = 'user' AND status = 'pending' AND expires_at > now())
     >= public.team_member_limit() THEN RAISE EXCEPTION 'TEAM_LIMIT' USING ERRCODE = 'XT429'; END IF;
  PERFORM public.team_rate_check(p_actor, 'invite_user', 30, interval '1 hour');
  -- Expired pending rows must not block a fresh invitation.
  UPDATE public.team_invitations SET status = 'revoked'
    WHERE team_id = p_team AND invitee_id = p_target AND kind = 'user' AND status = 'pending' AND expires_at <= now();
  BEGIN
    INSERT INTO public.team_invitations(team_id, kind, invitee_id, role, expires_at, created_by)
    VALUES (p_team, 'user', p_target, p_role, now() + interval '14 days', p_actor) RETURNING * INTO inv;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'TEAM_CONFLICT' USING ERRCODE = 'XT409';
  END;
  SELECT name INTO team_name FROM public.teams WHERE id = p_team;
  INSERT INTO public.notifications(user_id, title, message, type, link, metadata)
  VALUES (p_target, 'Team invitation', team_name || ' invited you to join as ' || p_role || '.', 'info', '/team',
          jsonb_build_object('kind', 'team_invitation', 'invitationId', inv.id));
  PERFORM public.team_audit_write(p_team, p_actor, 'invite_user', inv.id, jsonb_build_object('role', p_role));
  RETURN jsonb_build_object('id', inv.id, 'role', inv.role, 'expiresAt', inv.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.team_respond_invitation(p_actor uuid, p_invitation uuid, p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE inv public.team_invitations%rowtype;
BEGIN
  SELECT * INTO inv FROM public.team_invitations WHERE id = p_invitation AND kind = 'user' FOR UPDATE;
  -- Same answer for "not yours" and "does not exist" so ids cannot be probed.
  IF NOT FOUND OR inv.invitee_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404'; END IF;
  IF inv.status <> 'pending' OR inv.expires_at <= now() THEN RAISE EXCEPTION 'TEAM_EXPIRED' USING ERRCODE = 'XT410'; END IF;
  IF NOT p_accept THEN
    UPDATE public.team_invitations SET status = 'declined' WHERE id = inv.id;
    PERFORM public.team_audit_write(inv.team_id, p_actor, 'decline', inv.id, '{}'::jsonb);
    RETURN jsonb_build_object('status', 'declined');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(inv.team_id::text, 12));
  IF (SELECT count(*) FROM public.team_members WHERE team_id = inv.team_id) >= public.team_member_limit() THEN
    RAISE EXCEPTION 'TEAM_LIMIT' USING ERRCODE = 'XT429';
  END IF;
  INSERT INTO public.team_members(team_id, user_id, role, invited_by) VALUES (inv.team_id, p_actor, inv.role, inv.created_by)
    ON CONFLICT (team_id, user_id) DO NOTHING;
  UPDATE public.team_invitations SET status = 'accepted', use_count = 1 WHERE id = inv.id;
  PERFORM public.team_audit_write(inv.team_id, p_actor, 'accept', inv.id, '{}'::jsonb);
  RETURN jsonb_build_object('status', 'accepted', 'teamId', inv.team_id);
END $$;

CREATE OR REPLACE FUNCTION public.team_create_link(p_actor uuid, p_team uuid, p_role text, p_hours integer, p_max_uses integer, p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE m public.team_members%rowtype; inv public.team_invitations%rowtype;
BEGIN
  IF p_role NOT IN ('member','viewer') OR p_hours NOT BETWEEN 1 AND 720 OR p_max_uses NOT BETWEEN 1 AND 100
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'TEAM_INVALID' USING ERRCODE = '22023'; END IF;
  m := public.team_require_member(p_actor, p_team);
  IF NOT public.team_can_invite(m) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  PERFORM public.team_rate_check(p_actor, 'create_link', 20, interval '1 hour');
  IF (SELECT count(*) FROM public.team_invitations WHERE team_id = p_team AND kind = 'link' AND status = 'pending' AND expires_at > now()) >= 10 THEN
    RAISE EXCEPTION 'TEAM_LIMIT' USING ERRCODE = 'XT429';
  END IF;
  INSERT INTO public.team_invitations(team_id, kind, token_hash, role, max_uses, expires_at, created_by)
  VALUES (p_team, 'link', p_token_hash, p_role, p_max_uses, now() + make_interval(hours => p_hours), p_actor) RETURNING * INTO inv;
  PERFORM public.team_audit_write(p_team, p_actor, 'create_link', inv.id, jsonb_build_object('role', p_role, 'maxUses', p_max_uses, 'hours', p_hours));
  RETURN jsonb_build_object('id', inv.id, 'role', inv.role, 'expiresAt', inv.expires_at, 'maxUses', inv.max_uses);
END $$;

-- What a link holder sees before accepting. Invalid, expired, revoked and used-up
-- links all look the same so a token cannot be probed.
CREATE OR REPLACE FUNCTION public.team_preview_link(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE inv public.team_invitations%rowtype; t public.teams%rowtype;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404'; END IF;
  SELECT * INTO inv FROM public.team_invitations WHERE token_hash = p_token_hash AND kind = 'link';
  IF NOT FOUND OR inv.status <> 'pending' OR inv.expires_at <= now() OR inv.use_count >= inv.max_uses THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404';
  END IF;
  SELECT * INTO t FROM public.teams WHERE id = inv.team_id;
  RETURN jsonb_build_object('teamName', t.name, 'role', inv.role, 'expiresAt', inv.expires_at,
    'invitedBy', COALESCE((SELECT COALESCE(display_name, username) FROM public.profiles WHERE id = inv.created_by), 'A teammate'));
END $$;

CREATE OR REPLACE FUNCTION public.team_accept_link(p_actor uuid, p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE inv public.team_invitations%rowtype;
BEGIN
  IF p_actor IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404'; END IF;
  PERFORM public.team_rate_check(p_actor, 'accept_link', 20, interval '1 hour');
  SELECT * INTO inv FROM public.team_invitations WHERE token_hash = p_token_hash AND kind = 'link' FOR UPDATE;
  IF NOT FOUND OR inv.status <> 'pending' OR inv.expires_at <= now() OR inv.use_count >= inv.max_uses THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(inv.team_id::text, 12));
  IF EXISTS (SELECT 1 FROM public.team_members WHERE team_id = inv.team_id AND user_id = p_actor) THEN
    RAISE EXCEPTION 'TEAM_CONFLICT' USING ERRCODE = 'XT409';
  END IF;
  IF (SELECT count(*) FROM public.team_members WHERE team_id = inv.team_id) >= public.team_member_limit() THEN
    RAISE EXCEPTION 'TEAM_LIMIT' USING ERRCODE = 'XT429';
  END IF;
  INSERT INTO public.team_link_redemptions(invitation_id, user_id) VALUES (inv.id, p_actor);
  INSERT INTO public.team_members(team_id, user_id, role, invited_by) VALUES (inv.team_id, p_actor, inv.role, inv.created_by);
  UPDATE public.team_invitations SET use_count = use_count + 1,
    status = CASE WHEN use_count + 1 >= max_uses THEN 'exhausted' ELSE status END WHERE id = inv.id;
  PERFORM public.team_audit_write(inv.team_id, p_actor, 'accept_link', inv.id, '{}'::jsonb);
  RETURN jsonb_build_object('status', 'accepted', 'teamId', inv.team_id);
END $$;

CREATE OR REPLACE FUNCTION public.team_revoke_invitation(p_actor uuid, p_invitation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE inv public.team_invitations%rowtype; m public.team_members%rowtype;
BEGIN
  SELECT * INTO inv FROM public.team_invitations WHERE id = p_invitation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404'; END IF;
  m := public.team_require_member(p_actor, inv.team_id);
  IF NOT public.team_can_invite(m) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'TEAM_EXPIRED' USING ERRCODE = 'XT410'; END IF;
  UPDATE public.team_invitations SET status = 'revoked' WHERE id = inv.id;
  PERFORM public.team_audit_write(inv.team_id, p_actor, 'revoke', inv.id, jsonb_build_object('kind', inv.kind));
  RETURN jsonb_build_object('status', 'revoked');
END $$;

CREATE OR REPLACE FUNCTION public.team_remove_member(p_actor uuid, p_team uuid, p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me public.team_members%rowtype; target public.team_members%rowtype;
BEGIN
  me := public.team_require_member(p_actor, p_team);
  SELECT * INTO target FROM public.team_members WHERE team_id = p_team AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404'; END IF;
  IF target.role = 'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_user <> p_actor AND NOT (me.role = 'owner' OR (me.role = 'admin' AND target.role IN ('member','viewer'))) THEN
    RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.team_members WHERE team_id = p_team AND user_id = p_user;
  PERFORM public.team_audit_write(p_team, p_actor, CASE WHEN p_user = p_actor THEN 'leave' ELSE 'remove_member' END, p_user, '{}'::jsonb);
  RETURN jsonb_build_object('status', 'removed');
END $$;

-- Owner-only: change a member's role or whether they may invite others.
CREATE OR REPLACE FUNCTION public.team_set_member(p_actor uuid, p_team uuid, p_user uuid, p_role text, p_can_invite boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me public.team_members%rowtype; target public.team_members%rowtype;
BEGIN
  IF p_role NOT IN ('admin','member','viewer') THEN RAISE EXCEPTION 'TEAM_INVALID' USING ERRCODE = '22023'; END IF;
  me := public.team_require_member(p_actor, p_team);
  IF me.role <> 'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  SELECT * INTO target FROM public.team_members WHERE team_id = p_team AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_FOUND' USING ERRCODE = 'XT404'; END IF;
  IF target.role = 'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  UPDATE public.team_members SET role = p_role, can_invite = COALESCE(p_can_invite, false) WHERE team_id = p_team AND user_id = p_user;
  PERFORM public.team_audit_write(p_team, p_actor, 'set_member', p_user, jsonb_build_object('role', p_role, 'canInvite', COALESCE(p_can_invite, false)));
  RETURN jsonb_build_object('status', 'updated');
END $$;

-- Functions are callable by the backend service role only.
DO $lock$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'team_require_member(uuid,uuid)', 'team_can_invite(public.team_members)', 'team_audit_write(uuid,uuid,text,uuid,jsonb)',
    'team_rate_check(uuid,text,integer,interval)', 'team_create(uuid,text)', 'team_inbox(uuid)', 'team_overview(uuid,uuid)',
    'team_search_users(uuid,uuid,text)', 'team_invite_user(uuid,uuid,uuid,text)', 'team_respond_invitation(uuid,uuid,boolean)',
    'team_create_link(uuid,uuid,text,integer,integer,text)', 'team_preview_link(text)', 'team_accept_link(uuid,text)',
    'team_revoke_invitation(uuid,uuid)', 'team_remove_member(uuid,uuid,uuid)', 'team_set_member(uuid,uuid,uuid,text,boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $lock$;

COMMIT;
