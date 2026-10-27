-- Manual rollback for 20261026100000_browser_runs_durable.sql. NOT in supabase/migrations/ (never auto-applied).
-- Safe only when no browser run is queued or running and the internal execute and recover endpoints are disabled
-- (XROGA_BROWSER_INTERNAL_MODE unset): the table is the only record of a run's spec, state and cancel flag. Finished runs lose their
-- stored state here; their evidence stays in Xroga Drive.
begin;
drop table if exists public.browser_runs;
commit;
