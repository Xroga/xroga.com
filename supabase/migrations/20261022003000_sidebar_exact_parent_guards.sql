-- Current-main #836 integration repair only. No UI behavior or legacy rows are
-- rewritten. The older feature snapshot does not yet contain these tables.
DO $sidebar_parent_guard$
BEGIN
  IF to_regclass('public.xroga_sidebar_sections') IS NULL
     AND to_regclass('public.xroga_sidebar_items') IS NULL THEN
    RAISE NOTICE 'Sidebar parent guards not applicable: upstream tables absent';
    RETURN;
  END IF;
  IF to_regclass('public.xroga_sidebar_sections') IS NULL
     OR to_regclass('public.xroga_sidebar_items') IS NULL THEN
    RAISE EXCEPTION 'Incomplete sidebar schema, refusing partial parent repair';
  END IF;

  -- Qualify every outer reference. Unqualified names inside a subquery can
  -- bind to that subquery's relation and turn parent comparisons into tautologies.
  DROP POLICY IF EXISTS sidebar_sections_own ON public.xroga_sidebar_sections;
  CREATE POLICY sidebar_sections_own ON public.xroga_sidebar_sections
    FOR ALL TO authenticated
    USING (
      (SELECT auth.uid()) = xroga_sidebar_sections.user_id
      AND EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = xroga_sidebar_sections.project_id
          AND p.user_id = xroga_sidebar_sections.user_id)
    )
    WITH CHECK (
      (SELECT auth.uid()) = xroga_sidebar_sections.user_id
      AND EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = xroga_sidebar_sections.project_id
          AND p.user_id = xroga_sidebar_sections.user_id)
    );
  DROP POLICY IF EXISTS sidebar_items_own ON public.xroga_sidebar_items;
  CREATE POLICY sidebar_items_own ON public.xroga_sidebar_items
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = xroga_sidebar_items.user_id)
    WITH CHECK (
      (SELECT auth.uid()) = xroga_sidebar_items.user_id
      AND (xroga_sidebar_items.project_id IS NULL OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = xroga_sidebar_items.project_id
          AND p.user_id = xroga_sidebar_items.user_id))
      AND (xroga_sidebar_items.section_id IS NULL OR EXISTS (
        SELECT 1 FROM public.xroga_sidebar_sections s
        WHERE s.id = xroga_sidebar_items.section_id
          AND s.user_id = xroga_sidebar_items.user_id
          AND s.project_id = xroga_sidebar_items.project_id))
    );

  -- The FK protects the relationship while a parent update is concurrent with
  -- a child write. Policy preflight alone does not lock that parent relationship.
  CREATE UNIQUE INDEX IF NOT EXISTS xroga_sidebar_section_exact_parent
    ON public.xroga_sidebar_sections (id, project_id, user_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.xroga_sidebar_items'::regclass
        AND conname = 'xroga_sidebar_section_requires_project') THEN
    ALTER TABLE public.xroga_sidebar_items ADD CONSTRAINT xroga_sidebar_section_requires_project
      CHECK (section_id IS NULL OR project_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.xroga_sidebar_items'::regclass
        AND conname = 'xroga_sidebar_item_exact_section_parent') THEN
    ALTER TABLE public.xroga_sidebar_items ADD CONSTRAINT xroga_sidebar_item_exact_section_parent
      FOREIGN KEY (section_id, project_id, user_id)
      REFERENCES public.xroga_sidebar_sections (id, project_id, user_id)
      ON UPDATE RESTRICT ON DELETE SET NULL (section_id) NOT VALID;
  END IF;
END;
$sidebar_parent_guard$;

-- NOT VALID preserves existing rows and still enforces new writes/updates.
-- Existing-orphan inventory and VALIDATE CONSTRAINT require an independently
-- approved release/data-remediation step. Never delete or silently rewrite rows.
NOTIFY pgrst, 'reload schema';
