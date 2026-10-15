-- Preserve existing comment-edit policy while authorizing and writing atomically.
create or replace function public.update_community_comment_authorized(p_actor uuid, p_comment uuid, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor_role text;
  staff boolean;
  parent_id uuid;
  parent_author uuid;
  current_comment public.community_comments%rowtype;
begin
  if p_actor is null or p_comment is null or p_patch is null or jsonb_typeof(p_patch) <> 'object'
    or p_patch = '{}'::jsonb or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('body','is_hidden','is_accepted_answer'))
    or (p_patch ? 'body' and (jsonb_typeof(p_patch->'body') <> 'string' or char_length(p_patch->>'body') not between 1 and 5000))
    or (p_patch ? 'is_hidden' and jsonb_typeof(p_patch->'is_hidden') <> 'boolean')
    or (p_patch ? 'is_accepted_answer' and jsonb_typeof(p_patch->'is_accepted_answer') <> 'boolean') then
    raise exception 'invalid comment mutation' using errcode = '22023';
  end if;
  -- Profile lock serializes role demotion. Parent before child matches cascade order.
  select role into actor_role from public.profiles where id = p_actor for share;
  if not found then raise exception 'comment mutation forbidden' using errcode = '42501'; end if;
  staff := coalesce(actor_role in ('moderator','admin','owner'), false);
  select post_id into parent_id from public.community_comments where id = p_comment;
  if not found then raise exception 'comment unavailable' using errcode = 'P0002'; end if;
  select author_id into parent_author from public.community_posts where id = parent_id for share;
  if not found then raise exception 'comment unavailable' using errcode = 'P0002'; end if;
  select * into current_comment from public.community_comments where id = p_comment for update;
  if not found or current_comment.post_id is distinct from parent_id then
    raise exception 'comment unavailable' using errcode = 'P0002';
  end if;
  -- Existing policy permits editing one's comment on a locked discussion. No new
  -- lock/visibility restriction is introduced. Staff retain their field authority.
  if not staff and (
    p_patch ? 'is_hidden'
    or (p_patch ? 'body' and current_comment.author_id is distinct from p_actor)
    or (p_patch ? 'is_accepted_answer' and parent_author is distinct from p_actor)
  ) then raise exception 'comment mutation forbidden' using errcode = '42501'; end if;
  update public.community_comments set
    body = case when p_patch ? 'body' then p_patch->>'body' else body end,
    is_hidden = case when p_patch ? 'is_hidden' then (p_patch->>'is_hidden')::boolean else is_hidden end,
    is_accepted_answer = case when p_patch ? 'is_accepted_answer' then (p_patch->>'is_accepted_answer')::boolean else is_accepted_answer end
  where id = p_comment returning * into current_comment;
  if not found then raise exception 'comment mutation not acknowledged' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', current_comment.id, 'post_id', current_comment.post_id,
    'author_id', current_comment.author_id, 'body', current_comment.body,
    'is_hidden', current_comment.is_hidden, 'is_accepted_answer', current_comment.is_accepted_answer);
end;
$$;
revoke all on function public.update_community_comment_authorized(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.update_community_comment_authorized(uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
