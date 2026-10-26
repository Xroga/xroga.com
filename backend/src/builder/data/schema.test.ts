import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveBuildSpec } from '../spec.js';
import { chooseSchemaArchetype, generateSchema, schemaFor } from './schema.js';
import { reviewMigration, splitStatements } from './review.js';

const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';
const BOOKING = 'Build an appointment-booking web app with services, available appointment slots, booking confirmation, customer booking history, and an admin view. Prevent two customers from booking the same slot.';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

describe('schema archetype selection', () => {
  it('picks the schema the requirements call for, and none when no database is needed', () => {
    assert.equal(chooseSchemaArchetype(deriveBuildSpec(SAAS).spec), 'tasks');
    assert.equal(chooseSchemaArchetype(deriveBuildSpec(BOOKING).spec), 'booking');
    assert.equal(chooseSchemaArchetype(deriveBuildSpec(SITE).spec), null);
    assert.equal(schemaFor(deriveBuildSpec(SITE).spec), null);
  });
  it('is deterministic: identical bytes every time', () => {
    for (const id of ['tasks', 'booking', 'items'] as const) assert.equal(generateSchema(id).sql, generateSchema(id).sql);
  });
});

describe('generated schemas pass the SQL review', () => {
  for (const id of ['tasks', 'booking', 'items'] as const) {
    it(`${id}: no destructive finding, every table has RLS, and it is appliable`, () => {
      const schema = generateSchema(id);
      const review = reviewMigration(schema.sql);
      assert.equal(review.risk === 'destructive', false, JSON.stringify(review.findings));
      assert.deepEqual(review.tablesWithoutRls, []);
      assert.deepEqual([...review.createsTables].sort(), [...schema.tables].sort());
      assert.equal(review.appliable, true);
      assert.match(review.digest, /^[a-f0-9]{64}$/);
    });
  }
});

describe('SQL review refuses what must not run unattended', () => {
  const risk = (sql: string) => reviewMigration(sql).risk;
  it('flags destructive statements', () => {
    for (const sql of ['drop table public.tasks;', 'alter table public.t drop column c;', 'truncate public.t;', 'delete from public.t;', 'update public.t set a = 1;', 'alter table public.t disable row level security;', 'drop schema public cascade;']) {
      assert.equal(risk(sql), 'destructive', sql);
    }
  });
  it('flags access for signed-out visitors and always-true write policies', () => {
    assert.equal(risk('grant select on public.t to anon;'), 'destructive');
    assert.equal(risk('grant all on public.t to public;'), 'destructive');
    assert.equal(risk('create policy p on public.t for all to authenticated using (true) with check (true);'), 'destructive');
    assert.equal(risk('create policy p on public.t for select to anon using (true);'), 'destructive');
  });
  it('flags a table created without row-level security', () => {
    const review = reviewMigration('create table public.leaky (id int);');
    assert.equal(review.risk, 'destructive');
    assert.deepEqual(review.tablesWithoutRls, ['leaky']);
    assert.equal(review.appliable, false);
  });
  it('flags the authentication system, managed schemas, roles and unsafe definer functions', () => {
    assert.equal(risk('create trigger t after insert on auth.users for each row execute function public.f();'), 'destructive');
    assert.equal(risk('alter table auth.users add column x int;'), 'destructive');
    assert.equal(risk('create table storage.objects2 (id int);'), 'destructive');
    assert.equal(risk('create role evil;'), 'destructive');
    assert.equal(risk("create function public.f() returns int language sql security definer as $$ select 1 $$;"), 'destructive');
    assert.notEqual(risk("create function public.f() returns int language sql security definer set search_path = '' as $$ select 1 $$;"), 'destructive');
  });
  it('asks for review of renames, type changes, extensions and statements it does not recognise', () => {
    assert.equal(risk('alter table public.t rename column a to b;'), 'review');
    assert.equal(risk('alter table public.t alter column a type bigint;'), 'review');
    assert.equal(risk('create extension pgcrypto;'), 'review');
    assert.equal(risk('vacuum full public.t;'), 'review');
  });
  it('does not mistake text inside strings, comments or function bodies for statements', () => {
    const sql = "-- drop table x;\ncreate table if not exists public.a (note text default 'drop table b; delete from c');\nalter table public.a enable row level security;\ncreate function public.f() returns void language plpgsql set search_path = '' as $$ begin delete from public.a where false; end $$;";
    assert.equal(splitStatements(sql).length, 3);
    assert.notEqual(risk(sql), 'destructive');
  });
});
