# Credential migration and rollback

## Supported transitions

New OAuth, provider-key, PKCE and runtime-secret writes emit `vault:v3` only. Existing provider-key records can be migrated one owner and exact provider row at a time through `migrateLegacyProviderKey`. The database function `migrate_provider_key_to_vault` locks the existing identity through its credential revision and exact legacy ciphertext. It updates only a non-revoked, non-v3 row. Repeating the operation returns `ALREADY_CURRENT` and does not rotate the record again.

OAuth and GitHub users reconnect through their existing authorization epochs. Refresh-capable OAuth connections rewrite through the v3 save function. Project runtime v1 records remain readable only during an explicit migration window and all new writes are v3. Browser XOR records require the local user-consent flow because the backend cannot safely discover browser storage.

## Safe operating sequence

1. Run a redacted inventory. Do not print ciphertext or plaintext.
2. Configure and verify the approved managed `CryptoProvider` in an isolated non-production environment.
3. Enable the temporary migration window only for the controlled migration process.
4. Migrate one owner-bound record using the exact current revision.
5. Open the resulting v3 record through its real backend consumer and verify masked status plus an exact persistence receipt.
6. Repeat safely. Current and revoked rows are no-ops.
7. Disable the migration window and prove legacy reads fail closed.
8. Remove legacy objects only after successful v3 roundtrip and separate founder approval.

No live execution of this sequence is authorized in Phase 3. Production rollback keeps the v3 ciphertext and canonical tombstones. Application rollback may temporarily re-enable bounded legacy reads for records not yet migrated, but it must never restore plaintext writes, clear revocations or treat a private object as authority.

## Verified software properties

Focused tests cover randomized envelopes, full AAD substitution, ciphertext and wrapped-key tampering, credential and wrapping-key rotation, production development-key refusal, exact owner/revision migration CAS, idempotent replay, revoked-row refusal, OAuth authorization races, one-use PKCE and browser import ordering. Fresh and upgrade database execution remains source-bound CI evidence, not a property inferred from this document.
