-- Manual rollback for 20261022000000_storage_drive_foundation.sql. NOT in supabase/migrations/ (never auto-applied).
-- Only run after STORAGE_WRITE_MODE=legacy has been deployed and `select count(*) from public.storage_objects where state <> 'DELETED'`
-- has been reviewed: dropping the tables forgets which R2 objects belong to whom (the R2 bytes themselves remain).
begin;
alter table if exists public.project_files drop column if exists storage_object_id;
drop function if exists public.storage_migration_claim(uuid, text, integer, integer);
drop function if exists public.storage_reconcile_usage(uuid);
drop function if exists public.storage_expire_reservations(timestamptz);
drop function if exists public.storage_free(uuid);
drop function if exists public.storage_release(uuid, text);
drop function if exists public.storage_commit(uuid, bigint);
drop function if exists public.storage_reserve(uuid, uuid, bigint, timestamptz, bigint);
drop table if exists public.storage_migration_items;
drop table if exists public.storage_migration_jobs;
drop table if exists public.storage_audit_events;
drop table if exists public.storage_reservations;
drop table if exists public.storage_usage;
drop table if exists public.storage_objects cascade;
drop function if exists public.storage_objects_guard();
commit;
