-- Grant the service role the access provider-health durability actually needs.
--
-- The table created in 20260811093000 ended up with `service_role` holding only
-- REFERENCES, TRIGGER and TRUNCATE — no SELECT, INSERT, UPDATE or DELETE. Every comparable
-- table (model_routing_outcomes, model_benchmark_runs, universal_runs) grants the full DML
-- set, so this one was the outlier.
--
-- The consequence was quiet, which is what makes it worth a migration of its own rather
-- than a silent amendment. `hydrateProviderHealth` and the persist path both catch their
-- errors and warn, so a permission failure would not have broken a single request — the
-- durability §15 asks for would simply never have worked, while the code, the tests and the
-- table all indicated it did. That is the same shape as the dead rollback flag this work
-- was fixing.
--
-- Granted explicitly rather than left to Supabase's default privileges. The defaults are
-- what failed to apply here, and a permission the system depends on should be stated where
-- someone reading the schema can see it.

grant select, insert, update, delete on public.model_provider_health to service_role;

-- Unchanged and restated so the intent survives: this table describes Xroga's providers,
-- not any customer's data. RLS stays enabled with no permissive policy, and the browser
-- roles reach nothing — provider failure patterns are operational detail about Xroga's own
-- infrastructure, not something an authenticated session should be able to read.
revoke all on public.model_provider_health from anon, authenticated;
