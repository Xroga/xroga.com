-- Approved model-free verification of existing accounting RPCs, not a migration.
-- All test writes are rolled back. No model or real charge is performed.
BEGIN READ WRITE;
SET LOCAL statement_timeout='15s';
SET LOCAL ROLE service_role;
DO $verify$
DECLARE
  actor uuid;
  receipt uuid := '637f921a-703b-473c-a3e9-872cf3b7dd18';
  first_result jsonb;
  replay_result jsonb;
BEGIN
  SELECT user_id INTO STRICT actor FROM public.projects
    WHERE name='Google migration acceptance 20261027 synthetic only';
  first_result := public.record_ai_usage_atomic(actor,receipt,'batch1_fixture','verification',0,0,0);
  IF (first_result->>'userId')::uuid IS DISTINCT FROM actor OR
     (first_result->>'receiptId')::uuid IS DISTINCT FROM receipt OR
     (first_result->>'replayed')::boolean IS DISTINCT FROM false OR
     (first_result->>'costUsd')::numeric IS DISTINCT FROM 0 OR
     (first_result->>'inputTokens')::bigint IS DISTINCT FROM 0 OR
     (first_result->>'outputTokens')::bigint IS DISTINCT FROM 0
  THEN RAISE EXCEPTION 'ACCOUNTING_ZERO_RECEIPT_INVALID'; END IF;
  replay_result := public.record_ai_usage_atomic(actor,receipt,'batch1_fixture','verification',0,0,0);
  IF (replay_result->>'replayed')::boolean IS DISTINCT FROM true OR
     replay_result->>'ledgerId' IS DISTINCT FROM first_result->>'ledgerId'
  THEN RAISE EXCEPTION 'ACCOUNTING_IDEMPOTENCE_FAILED'; END IF;
  BEGIN
    PERFORM public.record_ai_usage_atomic(actor,receipt,'batch1_fixture','verification',1,0,0);
    RAISE EXCEPTION 'ACCOUNTING_CONFLICT_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM public.record_ai_usage_atomic('7920a323-6cee-487b-83bb-7f9d42f2d807',receipt,'batch1_fixture','verification',0,0,0);
    RAISE EXCEPTION 'ACCOUNTING_UNKNOWN_OWNER_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END;
$verify$;
ROLLBACK;
DO $cleanup$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_usage_ledger
       WHERE accounting_receipt_id='637f921a-703b-473c-a3e9-872cf3b7dd18')
  THEN RAISE EXCEPTION 'ACCOUNTING_TEST_RECEIPT_RETAINED'; END IF;
END;
$cleanup$;
SELECT 'PASS_ZERO_COST_ACCOUNTING_POSITIVE_REPLAY_CONFLICT_OWNER_DENIAL_ROLLED_BACK';
