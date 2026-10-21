# Current-main sidebar integration, bounded Phase 3 regression repair

Upstream source `20ba42d658140994dbcd4ef58b07782cbe413b72`, PR #836, is
separate from frozen accepted Phase 2. No production UI is changed here.

## Confirmed defect and scope

The upstream sidebar policies used unqualified outer `user_id` and `project_id`
references inside subqueries. PostgreSQL resolves matching names to the inner
relation. In particular, `s.project_id=project_id` compares the section column
to itself, allowing metadata to reference a section of a different same-owner
project. Local PostgreSQL-WASM reproduction allowed that mismatch. Independent
project RLS still rejected a foreign tenant in the same reproduction, so this
report does not claim a demonstrated foreign-tenant bypass.

The additive migration qualifies all outer references. A composite section,
project and owner FK also fences a parent move while a child write waits. It
uses PostgreSQL 15's column-specific delete action to clear only `section_id`,
preserving the existing owner/project metadata and normal section deletion.
Legitimate project moves already clear the selected section in the owning UI.

The migration returns without a certificate when the older feature snapshot
does not yet contain either upstream table. A partially present schema fails
closed. No accepted migration, review packet or original criterion is rewritten.

## Legacy rows, release and rollback

The new FK and non-null relationship check are `NOT VALID`. They enforce new
writes and parent updates without deleting, guessing or rewriting existing
metadata. Existing legacy-row consistency is not certified. Before an authorized
release, an owner must review the orphan count and repair only approved records,
then validate both constraints. No production query or remediation ran here.

An owner-approved inventory can use:

```sql
SELECT count(*) AS orphan_count
FROM public.xroga_sidebar_items i
LEFT JOIN public.xroga_sidebar_sections s
  ON s.id=i.section_id AND s.project_id=i.project_id AND s.user_id=i.user_id
WHERE i.section_id IS NOT NULL AND (i.project_id IS NULL OR s.id IS NULL);
```

Before deployment, rollback is a normal scoped source revert. After deployment,
keep the safety constraints and restore only a compatible reviewed application
revision. Dropping guards or deleting legacy rows is not an automatic rollback.

## Proof and current-main caller accounting

`scripts/security/tenant-rls.database.test.mjs` uses the exact upstream migration
with SHA256 `a60e170e2087eaa3b5357b91efa78dac397307aee8eedec50fa3c4f03c7555f4`.
It requires the existing isolated PostgreSQL CI database and covers reproduction,
valid writes, forged owner/foreign parent/mismatched section rejection, anonymous
denial, exact rollback, migration replay, retained legacy rows, normal section
deletion and a real two-client parent-update lock race. Local WASM proof is
separate and cannot replace this real PostgreSQL execution.

The current-main changes add twenty scanner candidates beyond the two existing
Array conversions. The integration projection rebinds only the two explicitly
reviewed native `Array.from` expressions, under exact file and nearest-function
hashes. Native Map construction and iteration were traced. Shadowing, source
drift, changed expressions and ambiguity fail closed. Newly added browser DML
and RPC candidates remain separate obligations, not inherited Phase 2 security
certificates or unexplained service-role exemptions. No browser client receives
a service-role credential from this repair.
