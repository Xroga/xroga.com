create or replace function public.mutate_community_post_authorized(p_actor uuid, p_post uuid, p_operation text, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare actor_role text; staff boolean; administrator boolean; current_post public.community_posts%rowtype;
begin
  if p_actor is null or p_post is null or p_operation is null or p_operation not in ('update','delete','moderate')
    or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid post mutation' using errcode='22023';
  end if;
  if (p_operation='delete' and p_patch <> '{}'::jsonb)
    or (p_operation <> 'delete' and p_patch = '{}'::jsonb)
    or (p_operation='update' and exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('title','body','category')))
    or (p_operation='moderate' and exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('status','is_pinned','is_hidden','is_locked')))
    or (p_patch ? 'title' and (jsonb_typeof(p_patch->'title') <> 'string' or char_length(p_patch->>'title') not between 5 and 150))
    or (p_patch ? 'body' and (jsonb_typeof(p_patch->'body') <> 'string' or char_length(p_patch->>'body') not between 10 and 5000))
    or (p_patch ? 'category' and (jsonb_typeof(p_patch->'category') <> 'string' or p_patch->>'category' not in ('feedback','feature_request','bug','question')))
    or (p_patch ? 'status' and jsonb_typeof(p_patch->'status') <> 'string')
    or exists(select 1 from jsonb_each(p_patch) v where v.key in ('is_pinned','is_hidden','is_locked') and jsonb_typeof(v.value) <> 'boolean') then
    raise exception 'invalid post mutation' using errcode='22023';
  end if;
  select role into actor_role from public.profiles where id=p_actor for share;
  if not found then raise exception 'post mutation forbidden' using errcode='42501'; end if;
  staff := coalesce(actor_role in ('moderator','admin','owner'),false);
  administrator := coalesce(actor_role in ('admin','owner'),false);
  select * into current_post from public.community_posts where id=p_post for update;
  if not found then raise exception 'post unavailable' using errcode='P0002'; end if;
  if (p_operation='moderate' and not staff)
    or (p_operation='update' and not staff and current_post.author_id is distinct from p_actor)
    or (p_operation='delete' and not administrator and current_post.author_id is distinct from p_actor) then
    raise exception 'post mutation forbidden' using errcode='42501';
  end if;
  if current_post.is_locked and ((p_operation='update' and not staff) or (p_operation='delete' and not administrator)) then
    raise exception 'post locked' using errcode='P0003';
  end if;
  if p_operation='delete' then
    -- Existing foreign-key cascades remain authoritative for comments, votes and notes.
    delete from public.community_posts where id=p_post returning * into current_post;
  else
    update public.community_posts set
      title=case when p_patch ? 'title' then p_patch->>'title' else title end,
      body=case when p_patch ? 'body' then p_patch->>'body' else body end,
      category=case when p_patch ? 'category' then p_patch->>'category' else category end,
      status=case when p_patch ? 'status' then p_patch->>'status' else status end,
      is_pinned=case when p_patch ? 'is_pinned' then (p_patch->>'is_pinned')::boolean else is_pinned end,
      is_hidden=case when p_patch ? 'is_hidden' then (p_patch->>'is_hidden')::boolean else is_hidden end,
      is_locked=case when p_patch ? 'is_locked' then (p_patch->>'is_locked')::boolean else is_locked end
    where id=p_post returning * into current_post;
  end if;
  if not found then raise exception 'post mutation not acknowledged' using errcode='P0002'; end if;
  return jsonb_build_object('operation',p_operation,'post',to_jsonb(current_post));
end;
$$;
revoke all on function public.mutate_community_post_authorized(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_community_post_authorized(uuid,uuid,text,jsonb) to service_role;
notify pgrst, 'reload schema';
