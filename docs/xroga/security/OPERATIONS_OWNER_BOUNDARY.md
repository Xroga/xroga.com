# Operations ownership correction — Command 007

Status: implemented, local focused tests/build pass; new real API/database cases await exact-source CI. Not full Command 007 acceptance.

## Confirmed defects and bounded fixes

- Portfolio fetched allowed owner IDs and project IDs independently. A misbound record could match both sets when a user legitimately accessed projects from multiple tenants. Each returned resource, environment, deployment, incident, alert and approval now matches the authoritative owner/project pair. Joined approval and automation parents also carry owner predicates.
- Persisted actions were authorized through their project without checking the action's own owner. Confirmation, approval and execution now reject mismatches before returning a previously verified receipt or mutating anything.
- Project-limited operators could reference a different project belonging to the same tenant. Known targets and supplied environments now resolve inside the authorized owner/project before action creation. Job/webhook retry writes independently constrain owner, project and expected attempt count. Conflict lookup is project-bound.
- Existing project-wide automation stop/resume remains explicitly project-scoped. No scheduler, external worker, provider execution or new authority system was introduced.

## Evidence and limitations

### Real database failure and nullable-result correction

Run38719473303 on feature6bd5f576 / integrated API-web e63d9a812fcd59468c561f940410061087162a4c passed42 security cases but failed the cross-project test and account cleanup. `queryOrThrow` defaulted a missing singleton to `[]`; this truthy value bypassed the missing-target branch and created an action before execution expired it with409. Singleton action/approval/resource/target/conflict lookups now explicitly preserve null. New unit cases reject missing targets BEFORE any action/audit write and return404 for missing actions. No negative assertion is relaxed.

The failed cleanup exposed a separate existing policy conflict: `production_audit_log` has immutable UPDATE/DELETE triggers but user/project CASCADE and actor SET NULL foreign keys. Account/project deletion after audited work cannot succeed. This remains a release-blocking account-lifecycle design gap, not a passing deletion journey. The real test proves immutable audit denial and unchanged evidence, and retains only explicitly identified synthetic audit subjects until mandatory whole-cluster disposal. CI now verifies no run-specific containers or volumes remain after `supabase stop --no-backup`; it does not disable the audit trigger, grant access, erase production audit history or silently ignore cleanup errors.

Nine singleton sites were corrected; the separate automation deduplication null-default issue is recorded but not changed here because enabling previously bypassed automation execution requires its own action/approval coverage. Original lease/revocation/authority gaps remain unresolved. Exact-source CI must certify this correction separately.

`operationsService.owner.test.ts` exercises injected-client denial before downstream access and independent write predicates. Together with existing permission tests: 4 PASS, no skipped tests. Backend compatibility check + TypeScript build PASS.

`tenantIsolation.local.integration.ts` adds real API denial of misbound receipts and cross-project job/webhook targets, verifies unchanged rows and absent actions, and retains a legitimate owner retry. The strengthened portfolio fixture makes both tenants legitimately visible, exposing the former cross-product defect. These are disposable Supabase fixtures, never production user records or provider calls. There are 43 defined security cases; their execution must be checked at the new commit.

The source-bound review register records 76 OperationsService candidates. Only the three access lookups are scoped-boundary classifications. The other 73 remain reviewed gaps: complete redaction, concurrent membership/approval revocation, lease completion atomicity, full evidence checking, unsupported target identities and account-bound external authority are not certified. Existing platform admin access remains broader than founder authorization. Commands 008–010 are not started by this patch.

## Compatibility and rollback

No schema or production configuration change. Previously accepted foreign/misbound targets now return a neutral 403; legitimate targets preserve their existing response shape. Rollback is a reviewed source revert, not a database rollback, but reverting these owner checks would reopen confirmed defects and is not an approved production remediation. Staged compatibility, real R2 and production catalog gates remain blocked.
