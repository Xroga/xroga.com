-- Each read uses one statement snapshot for role and content. No claim of
-- revoking data already read before a concurrent demotion is made.
create or replace function public.visible_community_posts(p_actor uuid)
returns setof public.community_posts language sql stable security invoker set search_path=pg_catalog,public
as $$
  select p.* from public.community_posts p where not p.is_hidden
    or exists(select 1 from public.profiles a where a.id=p_actor and a.role in ('moderator','admin','owner'));
$$;
create or replace function public.visible_community_comments(p_actor uuid,p_post uuid)
returns setof public.community_comments language sql stable security invoker set search_path=pg_catalog,public
as $$
  select c.* from public.community_comments c join public.community_posts p on p.id=c.post_id
  where c.post_id=p_post and ((not c.is_hidden and not p.is_hidden)
    or exists(select 1 from public.profiles a where a.id=p_actor and a.role in ('moderator','admin','owner')));
$$;
create or replace function public.read_community_staff_notes(p_actor uuid,p_post uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $$
  select jsonb_build_object('role',a.role,'notes',coalesce((
    select jsonb_agg(jsonb_build_object('id',n.id,'post_id',n.post_id,'author_id',n.author_id,'note',n.note,
      'created_at',n.created_at,'updated_at',n.updated_at) order by n.created_at desc)
    from public.community_admin_notes n where n.post_id=p_post),'[]'::jsonb))
  from public.profiles a where a.id=p_actor and a.role in ('moderator','admin','owner');
$$;
create or replace function public.read_community_staff_summary(p_actor uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $$
  select jsonb_build_object('role',a.role,'counts',(
    select jsonb_build_object(
      'open',count(*) filter(where status='open' and not is_hidden),
      'underReview',count(*) filter(where status='under_review'),
      'featureRequests',count(*) filter(where category='feature_request'),
      'bugs',count(*) filter(where category='bug'),
      'questions',count(*) filter(where category='question'),
      'planned',count(*) filter(where status='planned'),
      'building',count(*) filter(where status='building'),
      'released',count(*) filter(where status='released'),
      'hidden',count(*) filter(where is_hidden)) from public.community_posts))
  from public.profiles a where a.id=p_actor and a.role in ('moderator','admin','owner');
$$;
revoke all on function public.visible_community_posts(uuid),public.visible_community_comments(uuid,uuid),
  public.read_community_staff_notes(uuid,uuid),public.read_community_staff_summary(uuid) from public,anon,authenticated;
grant execute on function public.visible_community_posts(uuid),public.visible_community_comments(uuid,uuid),
  public.read_community_staff_notes(uuid,uuid),public.read_community_staff_summary(uuid) to service_role;
notify pgrst,'reload schema';
