create or replace function public.mutate_community_item_authorized(p_actor uuid,p_operation text,p_target uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare actor_role text; staff boolean; parent_id uuid; parent public.community_posts%rowtype;
  comment_row public.community_comments%rowtype; receipt jsonb; official text;
begin
  if p_actor is null or p_operation is null or p_operation not in ('create_post','create_comment','delete_comment','vote_add','vote_remove','add_note')
    or p_target is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'invalid community mutation' using errcode='22023';
  end if;
  if (p_operation in ('delete_comment','vote_add','vote_remove') and p_payload<>'{}'::jsonb)
    or (p_operation='create_post' and (not p_payload ?& array['title','body','category'] or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('title','body','category'))))
    or (p_operation='create_comment' and (not p_payload ? 'body' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('body','official_identity'))))
    or (p_operation='add_note' and (not p_payload ? 'note' or exists(select 1 from jsonb_object_keys(p_payload) k where k<>'note')))
    or exists(select 1 from jsonb_each(p_payload) v where v.key<>'official_identity' and jsonb_typeof(v.value)<>'string')
    or (p_payload ? 'official_identity' and jsonb_typeof(p_payload->'official_identity') not in ('string','null')) then
    raise exception 'invalid community mutation' using errcode='22023';
  end if;
  select coalesce(role,'member') into actor_role from public.profiles where id=p_actor for share;
  if not found then raise exception 'community mutation forbidden' using errcode='42501'; end if;
  staff:=coalesce(actor_role in ('moderator','admin','owner'),false);
  if p_operation='create_post' then
    insert into public.community_posts(id,author_id,title,body,category)
    values(p_target,p_actor,p_payload->>'title',p_payload->>'body',p_payload->>'category') returning to_jsonb(community_posts.*) into receipt;
  else
    parent_id:=p_target;
    if p_operation='delete_comment' then
      select post_id into parent_id from public.community_comments where id=p_target;
      if not found then raise exception 'community item unavailable' using errcode='P0002'; end if;
    end if;
    select * into parent from public.community_posts where id=parent_id for share;
    if not found then raise exception 'community item unavailable' using errcode='P0002'; end if;
    if p_operation='create_comment' then
      if parent.is_hidden and not staff then raise exception 'community item unavailable' using errcode='P0002'; end if;
      if parent.is_locked and not staff then raise exception 'discussion locked' using errcode='P0003'; end if;
      official:=p_payload->>'official_identity';
      if official is not null and (official not in ('xroga_team','xroga_owner','xroga_ai_ceo')
        or (official='xroga_team' and not staff) or (official<>'xroga_team' and actor_role<>'owner')) then
        raise exception 'official identity forbidden' using errcode='42501';
      end if;
      insert into public.community_comments(post_id,author_id,body,official_identity)
      values(parent_id,p_actor,p_payload->>'body',official) returning to_jsonb(community_comments.*) into receipt;
    elsif p_operation='delete_comment' then
      select * into comment_row from public.community_comments where id=p_target for update;
      if not found or comment_row.post_id is distinct from parent_id then raise exception 'community item unavailable' using errcode='P0002'; end if;
      if comment_row.author_id is distinct from p_actor and actor_role not in ('admin','owner') then
        raise exception 'community mutation forbidden' using errcode='42501';
      end if;
      delete from public.community_comments where id=p_target returning to_jsonb(community_comments.*) into receipt;
    elsif p_operation in ('vote_add','vote_remove') then
      if parent.is_hidden then raise exception 'community item unavailable' using errcode='P0002'; end if;
      if p_operation='vote_add' then
        insert into public.community_votes(post_id,user_id) values(parent_id,p_actor)
        on conflict(post_id,user_id) do update set user_id=excluded.user_id
        returning to_jsonb(community_votes.*) into receipt;
      else
        delete from public.community_votes where post_id=parent_id and user_id=p_actor;
        receipt:=jsonb_build_object('post_id',parent_id,'user_id',p_actor,'voted',false);
      end if;
    elsif p_operation='add_note' then
      if not staff then raise exception 'community mutation forbidden' using errcode='42501'; end if;
      insert into public.community_admin_notes(post_id,author_id,note) values(parent_id,p_actor,p_payload->>'note')
      returning to_jsonb(community_admin_notes.*) into receipt;
    end if;
  end if;
  if receipt is null then raise exception 'community mutation not acknowledged' using errcode='P0002'; end if;
  return jsonb_build_object('operation',p_operation,'target',p_target,'row',receipt);
end;
$$;
revoke all on function public.mutate_community_item_authorized(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_community_item_authorized(uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
