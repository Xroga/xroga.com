-- Team activity timeline: a read-only view of the team's own audit trail for its members.
-- Purely additive; no table or column changes. Search noise is excluded.
BEGIN;

CREATE OR REPLACE FUNCTION public.team_activity(p_actor uuid, p_team uuid, p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.team_require_member(p_actor, p_team);
  RETURN COALESCE((
    SELECT jsonb_agg(s.e ORDER BY s.id DESC) FROM (
      SELECT a.id, jsonb_build_object(
        'id', a.id, 'action', a.action, 'at', a.created_at, 'detail', a.detail,
        'actor', jsonb_build_object('userId', a.actor_id, 'username', ap.username, 'displayName', ap.display_name, 'avatarUrl', ap.avatar_url),
        'target', CASE
          WHEN a.action = 'invite_user' THEN (SELECT jsonb_build_object('username', tp.username, 'displayName', tp.display_name)
            FROM public.team_invitations i JOIN public.profiles tp ON tp.id = i.invitee_id WHERE i.id = a.target_id)
          WHEN a.action IN ('remove_member', 'set_member') THEN (SELECT jsonb_build_object('username', tp.username, 'displayName', tp.display_name)
            FROM public.profiles tp WHERE tp.id = a.target_id)
          ELSE NULL END) AS e
      FROM public.team_audit a LEFT JOIN public.profiles ap ON ap.id = a.actor_id
      WHERE a.team_id = p_team AND a.action <> 'search'
      ORDER BY a.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
    ) s), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.team_activity(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_activity(uuid, uuid, integer) TO service_role;

COMMIT;
