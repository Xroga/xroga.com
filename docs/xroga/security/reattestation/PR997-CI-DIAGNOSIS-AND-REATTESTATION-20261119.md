# PR #997 CI diagnosis and re-attestation package, 19 November 2026

Prepared by the implementation engineer. **This is not an approval.** It names exactly what a frozen review binds to and what the authorized reviewer must re-attest. No register, ledger or review decision was edited or regenerated to make CI pass.

PR: Xroga/xroga.com#997, branch `claude/fix-plugin-permission-load-20261119`, head `93ccd174bfaf0ebf0c864b81aed884834573d697`, directly on `main` `2605a3b9915e32d10a77532f760c4f726912ec04`.

## 1. What each failing check really is

| Check / step | Cause | Category | Fixable by the engineer? |
| --- | --- | --- | --- |
| `unit`, "Verify frozen Phase 2 register": `Semantic review source drift: B1-P2-d068943836963a9c` | The frozen record (family `credentials-oauth`, source `backend/src/services/integrations/oauthPkceStore.ts`) is bound to sha256 `d0d00b074aee1a1c610abbe6dd2424f8b9f581c3c73f7780619317d69ce7fc96`. `main` has exactly that hash. #997 changes the file (new hash `7fd9ec3fbb5f5c208c54e7bbea5f069f01f050bed75cae17091253f959646eb2`). | Stale reviewed evidence caused by this PR's source change | No. Needs re-attestation by the original reviewer. |
| `integrated-candidate` and `disposable-policy-database`: `Unbound original non-persistence review` | Same file: a stored NOT_PERSISTENCE review records the original file hash, which no longer matches. | Same as above | No. Same re-attestation. |
| `structured-mission-policy`: `git merge-base --is-ancestor d7ce7def4ab94a72587907cb4f60690d7f288838 HEAD` | The mission manifest `docs/xroga/missions/local-multilingual-dictation-20261030.json` and `docs/xroga/evidence/local-voice-20261030/caller-reconciliation.json` name commit `d7ce7def4` as a base. That commit exists only on the `codex/voice-*` branches and `live943`. It is not an ancestor of `main`, so every PR into `main` fails this check. | Branch ancestry defect that already exists on `main` | Not by editing this PR. The voice mission owner must land those commits or re-base the manifest on a commit that is on `main`. |
| `unit` additionally on `main` itself: `Inventory drift: docs/xroga/current-state.json` | A generated truth map is stale on `main` (Unit tests also fail on `main` at `2605a3b99`). | Existing failure on `main` | Yes, by running the generator's own write mode on `main` in a separate PR. Not done here, to keep #997 one reviewable change. |
| `build`, `deterministic-golden`, `authenticated-browser` | Pass. | | |

## 2. The change that needs re-attestation

File `backend/src/services/integrations/oauthPkceStore.ts`, one change plus its regression test.

```diff
@@ -261,7 +261,10 @@ export async function loadProviderToken(
-    requireLegacyCredentialMigrationWindow();
+    // A permission preference (xroga_plugin_permission_policy) is a plain value, not a credential, and is never sealed; only real
+    // credentials need the legacy migration window. Without this exception every saved permission choice failed to load in production
+    // and the system fell back to "always ask" whatever the owner had chosen.
+    if (!isPolicyProvider(provider)) requireLegacyCredentialMigrationWindow();
```

Test: `oauthPkceStore.test.ts`, +15/-1 (policy row loads with the window closed; a legacy credential row is still refused).

**What it does.** `loadProviderToken` ran `requireLegacyCredentialMigrationWindow()` for every provider row. Rows named `xroga_plugin_permission_policy` and `xroga_plugin_permission_policy__<toolkit>` hold only a permission-mode string (`always_ask`, `read_only`, `low_risk`, `full_access`), never a credential. In production the migration window is closed, so every policy read failed and the app silently fell back to `always_ask`, so saved permission choices never applied. The change exempts only those policy rows.

**Security analysis for the reviewer**
- Real credentials still go through the migration-window check; only the two policy provider names are exempt.
- The reader (`pluginPermissionPolicy.ts`) loads with `authoritativeOnly: true`, validates the value against the four allowed modes, and on any error or unknown value returns `always_ask` (fail closed).
- The backend applies the mode per call. Sending, publishing, deleting and payments keep an approval card in every mode (`autoApprovesCall`), and `read_only` refuses changes.
- Tenant scope comes from the verified user id on every read and write.
- Residual risk: a credential stored under a provider name starting with `xroga_plugin_permission_policy` would skip the window check. Nothing writes such rows except `setUserPluginPermissionMode`.

## 3. Evidence
- Unit test in `oauthPkceStore.test.ts` as above.
- Live on staging with real DeepSeek: a saved permission choice loads and a Sheets read runs with no approval card (37 s); the account-wide Full access switch turns cards off and on.
- Two-account staging check (see `docs/xroga/evidence/browser-operator-20261110/SECURITY-SELF-REVIEW-20261119.md`): the two accounts' connections and Full access settings stayed separate.
- The same fix runs on the integration branch `claude/ops-integrated-20261112`, staging revision `00144-wew`.

## 4. What the original reviewer must do
Re-attest the records bound to `oauthPkceStore.ts` (hash `d0d00b07...` to `7fd9ec3f...`): `B1-P2-d068943836963a9c` in `PHASE-2-FROZEN-WORKLIST.json`, `PHASE-2-CLOSURE-LEDGER.json` and `PHASE-2-REVIEW-DECISIONS.json`, the non-persistence review record, and every phase-1 and phase-3 worklist that carries the same source hash. The reviewer decides whether the change is accepted and records it in their own name.

## 5. Rollback
Revert the single commit `93ccd174b` (one line in `oauthPkceStore.ts` and its test). Effect: saved permission choices stop loading in production and every app asks again, which is the safe default.
