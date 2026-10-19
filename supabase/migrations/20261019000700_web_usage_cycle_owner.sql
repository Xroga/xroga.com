-- A cycle ID alone cannot authorize attribution to its current owner. The
-- composite FK serializes the decisive insert against cycle-owner changes.
-- Existing invalid history stops validation, rather than being rewritten.
CREATE UNIQUE INDEX IF NOT EXISTS xroga_billing_cycles_id_owner_key
  ON public.xroga_billing_cycles (id, user_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.xroga_web_usage'::regclass
      AND conname='xroga_web_usage_cycle_owner_fkey') THEN
    ALTER TABLE public.xroga_web_usage
      ADD CONSTRAINT xroga_web_usage_cycle_owner_fkey
      FOREIGN KEY (cycle_id, user_id)
      REFERENCES public.xroga_billing_cycles (id, user_id)
      ON DELETE SET NULL (cycle_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.xroga_web_usage VALIDATE CONSTRAINT xroga_web_usage_cycle_owner_fkey;
