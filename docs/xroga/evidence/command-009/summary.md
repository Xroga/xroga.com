# Command 009 software evidence

All enabled new OAuth, provider-key and project-runtime secret writers use the canonical version 3 CredentialVault envelope before persistence. The envelope uses randomized data keys and authenticated identity binding for owner, provider, account, credential type, record, scope, revision and key identity. Private backend consumers open plaintext only inside the narrow adapter boundary. Browser code has no new-secret local writer or general reveal/copy API. Legacy browser imports require explicit selection, password and consent, and local cleanup happens only after a successful server-vault write.

Focused tests cover wrong-owner substitution, ciphertext and metadata tampering, rotation, revocation, PKCE TTL and one-use behavior, idempotent migration, concurrent revoke and production refusal of development crypto. The credential source audit retains 117 candidates in 37 semantic groups and six canonical static vault importers. Legacy reads are denied on production hosts unless the explicit bounded migration window is enabled.

Production managed key custody has not been selected or verified. Production and unknown runtimes fail closed without a managed provider, so software is ready for a controlled cutover but Phase 3 cannot be declared fully verified. No live credential migration or production write was performed.
