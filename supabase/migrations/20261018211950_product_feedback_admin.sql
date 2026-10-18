-- Product feedback storage with public submission and one-account review access.

begin;

create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  submitter_email text default nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''),
  display_name text,
  rating smallint not null,
  experience text not null default '',
  ideas text not null default '',
  page_path text,
  created_at timestamptz not null default now(),
  constraint product_feedback_rating_check check (rating between 1 and 5),
  constraint product_feedback_content_check check (
    char_length(btrim(experience)) > 0 or char_length(btrim(ideas)) > 0
  ),
  constraint product_feedback_experience_length_check check (char_length(experience) <= 2000),
  constraint product_feedback_ideas_length_check check (char_length(ideas) <= 2000),
  constraint product_feedback_display_name_length_check check (
    display_name is null or char_length(display_name) <= 120
  ),
  constraint product_feedback_page_path_length_check check (
    page_path is null or char_length(page_path) <= 500
  )
);

create index if not exists idx_product_feedback_created_at
  on public.product_feedback (created_at desc, id desc);
create index if not exists idx_product_feedback_user_id
  on public.product_feedback (user_id)
  where user_id is not null;

alter table public.product_feedback enable row level security;

drop policy if exists "Anyone can submit product feedback" on public.product_feedback;
create policy "Anyone can submit product feedback"
  on public.product_feedback for insert
  to anon, authenticated
  with check (
    user_id is not distinct from (select auth.uid())
    and submitter_email is not distinct from nullif(
      lower(coalesce((select auth.jwt()) ->> 'email', '')),
      ''
    )
  );

drop policy if exists "Hello account can review product feedback" on public.product_feedback;
create policy "Hello account can review product feedback"
  on public.product_feedback for select
  to authenticated
  using (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'hello@xroga.com'
  );

revoke all on public.product_feedback from public, anon, authenticated;
grant insert on public.product_feedback to anon, authenticated;
grant select on public.product_feedback to authenticated;
grant all on public.product_feedback to service_role;

notify pgrst, 'reload schema';

commit;
