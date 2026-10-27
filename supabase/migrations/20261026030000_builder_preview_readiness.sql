-- Batch 2 audit: the last strict readiness result for a project's preview, recorded against the revision it tested.
-- Additive, nullable, no default and no backfill. Depends on 20261026000100_builder_projects.sql.
-- Not applied by this change; apply through the verified migration workflow after review.
--
-- Value: '<revision id>:ready' or '<revision id>:failed'. It lets the preview state be derived from what was actually
-- observed for the head revision instead of from the project's overall state (a project that is awaiting browser tests,
-- or whose tests failed, can still have a healthy, responding preview).
-- Rollback: ALTER TABLE public.builder_projects DROP COLUMN IF EXISTS preview_readiness; (nothing else references it).

ALTER TABLE public.builder_projects
  ADD COLUMN IF NOT EXISTS preview_readiness TEXT
  CHECK (preview_readiness IS NULL OR preview_readiness ~ '^[0-9a-f-]{36}:(ready|failed)$');

NOTIFY pgrst,'reload schema';
