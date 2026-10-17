-- Bind cancellation to a DB-clock receipt, not a fabricated worker epoch.
CREATE OR REPLACE FUNCTION public.cancel_swarm_run_owned(p_run_id UUID, p_owner_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  cancelled public.swarm_runs%ROWTYPE;
BEGIN
  UPDATE public.swarm_runs SET
    status = 'cancelled',
    output = '{"type":"error","error":"Build stopped.","code":"BUILD_CANCELLED"}'::jsonb,
    completed_at = clock_timestamp(),
    iteration_count = COALESCE(iteration_count,0) + 1,
    lease_generation = NULL, worker_id = NULL, heartbeat_at = NULL
  WHERE id = p_run_id AND user_id = p_owner_id AND status = 'running'
  RETURNING * INTO cancelled;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',cancelled.id,'user_id',cancelled.user_id,'status',cancelled.status,
    'output',cancelled.output,'completed_at',cancelled.completed_at,'created_at',cancelled.created_at,
    'iteration_count',cancelled.iteration_count,'feature_category',cancelled.feature_category,
    'lease_generation',cancelled.lease_generation);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_swarm_run_owned(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_swarm_run_owned(UUID,UUID) TO service_role;

-- This distinct receipt boundary does not weaken persist_build_outcome_attempt:
-- worker learning still requires its non-null generation. Both lock the same run.
CREATE OR REPLACE FUNCTION public.persist_cancelled_build_outcome(
  p_run_id UUID, p_owner_id UUID, p_completed_at TIMESTAMPTZ,
  p_output JSONB, p_outcome JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  current_run public.swarm_runs%ROWTYPE;
  candidate public.build_outcomes%ROWTYPE;
BEGIN
  IF p_completed_at IS NULL
     OR jsonb_typeof(p_outcome) IS DISTINCT FROM 'object'
     OR p_outcome->>'run_id' IS DISTINCT FROM p_run_id::text
     OR p_outcome->>'user_id' IS DISTINCT FROM p_owner_id::text
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_outcome) k WHERE k NOT IN
       ('run_id','user_id','schema_version','reuse_scope','terminal_status','success','feature_category','failure_category','failure_code','failure_domain','failure_stage','verified','taxonomy_id','product_surface','product_subtype','domain_category','recipe_id','golden_example_ids','framework','runtime','adapter_id','generated_file_count','verification_attempts','repair_rounds','build_passed','test_passed','browser_passed','runtime_passed','saved_project_ready','publication_requested','publication_succeeded','deployment_requested','deployment_succeeded','learning_eligible','learning_exclusion_reason','learning_decision','iteration_count','duration_ms','model_telemetry','recorded_at','updated_at'))
  THEN RETURN FALSE; END IF;
  SELECT * INTO current_run FROM public.swarm_runs
    WHERE id = p_run_id AND user_id = p_owner_id FOR UPDATE;
  IF NOT FOUND OR current_run.lease_generation IS NOT NULL
     OR current_run.worker_id IS NOT NULL OR current_run.heartbeat_at IS NOT NULL
     OR current_run.status IS DISTINCT FROM 'cancelled'
     OR current_run.output IS DISTINCT FROM '{"type":"error","error":"Build stopped.","code":"BUILD_CANCELLED"}'::jsonb
     OR current_run.completed_at IS DISTINCT FROM p_completed_at
     OR COALESCE(current_run.output, 'null'::jsonb) IS DISTINCT FROM COALESCE(p_output, 'null'::jsonb)
  THEN RETURN FALSE; END IF;
  candidate := jsonb_populate_record(NULL::public.build_outcomes, p_outcome);
  IF candidate.terminal_status IS DISTINCT FROM current_run.status
     OR candidate.success IS DISTINCT FROM FALSE
     OR candidate.failure_category IS DISTINCT FROM 'user_cancelled'
     OR candidate.failure_code IS DISTINCT FROM 'BUILD_CANCELLED'
     OR candidate.iteration_count IS DISTINCT FROM current_run.iteration_count
     OR candidate.feature_category IS DISTINCT FROM current_run.feature_category
  THEN RETURN FALSE; END IF;
  INSERT INTO public.build_outcomes (run_id,user_id,schema_version,reuse_scope,terminal_status,success,feature_category,failure_category,failure_code,failure_domain,failure_stage,verified,taxonomy_id,product_surface,product_subtype,domain_category,recipe_id,golden_example_ids,framework,runtime,adapter_id,generated_file_count,verification_attempts,repair_rounds,build_passed,test_passed,browser_passed,runtime_passed,saved_project_ready,publication_requested,publication_succeeded,deployment_requested,deployment_succeeded,learning_eligible,learning_exclusion_reason,learning_decision,iteration_count,duration_ms,model_telemetry,recorded_at,updated_at)
  VALUES (candidate.run_id,candidate.user_id,candidate.schema_version,candidate.reuse_scope,candidate.terminal_status,candidate.success,candidate.feature_category,candidate.failure_category,candidate.failure_code,candidate.failure_domain,candidate.failure_stage,candidate.verified,candidate.taxonomy_id,candidate.product_surface,candidate.product_subtype,candidate.domain_category,candidate.recipe_id,candidate.golden_example_ids,candidate.framework,candidate.runtime,candidate.adapter_id,candidate.generated_file_count,candidate.verification_attempts,candidate.repair_rounds,candidate.build_passed,candidate.test_passed,candidate.browser_passed,candidate.runtime_passed,candidate.saved_project_ready,candidate.publication_requested,candidate.publication_succeeded,candidate.deployment_requested,candidate.deployment_succeeded,candidate.learning_eligible,candidate.learning_exclusion_reason,candidate.learning_decision,candidate.iteration_count,candidate.duration_ms,candidate.model_telemetry,candidate.recorded_at,candidate.updated_at)
  ON CONFLICT (run_id) DO UPDATE SET
    schema_version = EXCLUDED.schema_version,
    reuse_scope = EXCLUDED.reuse_scope,
    terminal_status = EXCLUDED.terminal_status,
    success = EXCLUDED.success,
    feature_category = EXCLUDED.feature_category,
    failure_category = EXCLUDED.failure_category,
    failure_code = EXCLUDED.failure_code,
    failure_domain = EXCLUDED.failure_domain,
    failure_stage = EXCLUDED.failure_stage,
    verified = EXCLUDED.verified,
    taxonomy_id = EXCLUDED.taxonomy_id,
    product_surface = EXCLUDED.product_surface,
    product_subtype = EXCLUDED.product_subtype,
    domain_category = EXCLUDED.domain_category,
    recipe_id = EXCLUDED.recipe_id,
    golden_example_ids = EXCLUDED.golden_example_ids,
    framework = EXCLUDED.framework,
    runtime = EXCLUDED.runtime,
    adapter_id = EXCLUDED.adapter_id,
    generated_file_count = EXCLUDED.generated_file_count,
    verification_attempts = EXCLUDED.verification_attempts,
    repair_rounds = EXCLUDED.repair_rounds,
    build_passed = EXCLUDED.build_passed,
    test_passed = EXCLUDED.test_passed,
    browser_passed = EXCLUDED.browser_passed,
    runtime_passed = EXCLUDED.runtime_passed,
    saved_project_ready = EXCLUDED.saved_project_ready,
    publication_requested = EXCLUDED.publication_requested,
    publication_succeeded = EXCLUDED.publication_succeeded,
    deployment_requested = EXCLUDED.deployment_requested,
    deployment_succeeded = EXCLUDED.deployment_succeeded,
    learning_eligible = EXCLUDED.learning_eligible,
    learning_exclusion_reason = EXCLUDED.learning_exclusion_reason,
    learning_decision = EXCLUDED.learning_decision,
    iteration_count = EXCLUDED.iteration_count,
    duration_ms = EXCLUDED.duration_ms,
    model_telemetry = EXCLUDED.model_telemetry,
    recorded_at = EXCLUDED.recorded_at,
    updated_at = EXCLUDED.updated_at
  WHERE build_outcomes.user_id = p_owner_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_cancelled_build_outcome(UUID,UUID,TIMESTAMPTZ,JSONB,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_cancelled_build_outcome(UUID,UUID,TIMESTAMPTZ,JSONB,JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
