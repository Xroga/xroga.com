-- Batch 2 Phase 3: customer-owned Supabase and Vercel operations.
-- Additive. Widens the allowed providers and actions of builder_external_operations (created in
-- 20261026010000_builder_phase2.sql). No data is changed and no existing row can violate the wider
-- constraints. Not applied by this change; apply through the verified migration workflow after review.
-- Rollback: restore the narrower constraints (provider 'github' only; actions create_repository and
-- push_revision) after deleting any rows that use the new values.

ALTER TABLE public.builder_external_operations
  DROP CONSTRAINT IF EXISTS builder_external_operations_provider_check;
ALTER TABLE public.builder_external_operations
  ADD CONSTRAINT builder_external_operations_provider_check
  CHECK (provider IN ('github','supabase','vercel'));

ALTER TABLE public.builder_external_operations
  DROP CONSTRAINT IF EXISTS builder_external_operations_action_check;
ALTER TABLE public.builder_external_operations
  ADD CONSTRAINT builder_external_operations_action_check
  CHECK (action IN (
    'create_repository','push_revision',
    'bind_supabase_project','apply_migration',
    'prepare_preview','deploy_preview','promote_production'
  ));

NOTIFY pgrst,'reload schema';
