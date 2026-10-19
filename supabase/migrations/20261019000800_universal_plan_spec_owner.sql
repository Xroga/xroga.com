-- Preserve the original optional spec link while binding every non-null parent
-- to the same owner and logical project at the decisive database write.
-- Invalid existing history stops validation and is never silently rewritten.
CREATE UNIQUE INDEX IF NOT EXISTS project_specs_id_owner_project_key
  ON public.project_specs (spec_id, user_id, project_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.architecture_plans'::regclass
      AND conname='architecture_plans_spec_owner_project_fkey') THEN
    ALTER TABLE public.architecture_plans
      ADD CONSTRAINT architecture_plans_spec_owner_project_fkey
      FOREIGN KEY (spec_id, user_id, project_id)
      REFERENCES public.project_specs (spec_id, user_id, project_id)
      ON DELETE SET NULL (spec_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.architecture_plans VALIDATE CONSTRAINT architecture_plans_spec_owner_project_fkey;
