# CredentialVault model and cutover state

The canonical backend boundary is `CredentialVault` plus the runtime provider injection in `credentialVaultRuntime.ts`. Every v3 record uses a random 256-bit data key and AES-256-GCM. The injected `CryptoProvider` wraps that key. Authenticated data binds tenant, owner, provider, connected account, credential type, record ID, credential revision and use scope. Unknown versions, malformed encodings, ciphertext changes, wrapped-key substitution and any identity-field substitution fail closed.

New enabled writers now seal before persistence:

- BYOK and named custom provider keys, including the four-row Supabase bundle
- Supabase and Vercel OAuth access and refresh tokens
- direct Vercel personal tokens
- GitHub OAuth tokens in both canonical authority rows
- OAuth PKCE verifiers
- project runtime secrets

Database writes retain the existing authorization epochs, credential revisions, tombstones and owner checks. Consumers open values only in the backend and re-read the canonical row after the asynchronous key-provider call. A revocation or rotation completed during that wait prevents stale plaintext from being used. New storage mirrors contain v3 envelopes. GitHub’s old raw mirror is no longer an enabled authority or metadata source.

The browser XOR writer and reveal/copy API have been removed. The settings panel sends new values directly to the authenticated provider-key endpoint and receives masked metadata only. Existing browser-only records are detected locally. A user must select one record, enter its legacy password and check an explicit consent control before a one-time server-vault import. Local cleanup happens only after the server save succeeds. Users are told to rotate imported values because the old browser custody was weak.

Legacy reads are migration-only. Test and local development can exercise them. A production host refuses them unless `XROGA_LEGACY_CREDENTIAL_MIGRATION=enabled` names a temporary migration window. The owner-scoped provider-key migration uses an exact revision and legacy-ciphertext CAS, cannot revive a revoked row, and returns `ALREADY_CURRENT` without rewriting an existing v3 envelope. Production cutover must remove that flag.

The current source-bound AST inventory contains 117 conservative candidates in 37 files, including 18 possible writes or lifecycle calls, 92 private consumers, three private-object writes and one browser cleanup write. Six enabled backend files statically import the canonical vault boundary. The inventory intentionally retains metadata preferences, revocation markers and platform environment consumers as candidates. Their semantic dispositions are recorded in `credential-caller-dispositions.md`.

`DevelopmentCryptoProvider` accepts only an explicitly supplied 32-byte key ring. It never reads a service-role key, JWT secret, password or fixed default. It refuses production, unknown runtime mode and production-host flags. Production without an injected managed provider fails before a credential can be sealed or opened.

Production managed key custody remains unspecified. No managed key resource was provisioned, no billing was enabled, and no live credential was read or migrated. The software can be tested with ephemeral keys, but Phase 3 cannot be reported as `B1_P3_VERIFIED` until an approved production provider and real custody/cutover evidence satisfy the original contract.
