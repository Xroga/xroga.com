-- Tighten Xroga sidebar ownership checks without replacing data or changing UI.
-- Qualify references to the policy target, not to an inner query's identically named columns.
-- Prevents accidental tautological (p.user_id = p.user_id) conditions.
alter policy "sidebar_sections_own" on public.xroga_sidebar_sections
  to authenticated
  using (
    (select auth.uid()) = xroga_sidebar_sections.user_id
    and exists (
      select 1 from public.projects p
      where p.id = xroga_sidebar_sections.project_id
        and p.user_id = xroga_sidebar_sections.user_id
    )
  )
  with check (
    (select auth.uid()) = xroga_sidebar_sections.user_id
    and exists (
      select 1 from public.projects p
      where p.id = xroga_sidebar_sections.project_id
        and p.user_id = xroga_sidebar_sections.user_id
    )
  );

alter policy "sidebar_items_own" on public.xroga_sidebar_items
  to authenticated
  using ((select auth.uid()) = xroga_sidebar_items.user_id)
  with check (
    (select auth.uid()) = xroga_sidebar_items.user_id
    and (
      xroga_sidebar_items.project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = xroga_sidebar_items.project_id
          and p.user_id = xroga_sidebar_items.user_id
      )
    )
    and (
      xroga_sidebar_items.section_id is null
      or exists (
        select 1 from public.xroga_sidebar_sections s
        where s.id = xroga_sidebar_items.section_id
          and s.user_id = xroga_sidebar_items.user_id
          and s.project_id = xroga_sidebar_items.project_id
      )
    )
  );

-- No DML or backfills. Existing projects, chats, pins and titles are untouched.
