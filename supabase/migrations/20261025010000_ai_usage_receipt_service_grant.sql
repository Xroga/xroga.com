-- The atomic usage RPC runs as service_role and attaches its receipt to the
-- ledger row it just inserted. The existing grant permits INSERT and SELECT,
-- but not this column-scoped UPDATE; without it, completed model calls fail
-- closed and no answer reaches the user.
GRANT UPDATE (accounting_receipt_id) ON public.ai_usage_ledger TO service_role;
