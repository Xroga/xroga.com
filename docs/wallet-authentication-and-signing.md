# Wallet authentication and signing

Status: **Implemented**.

Challenges are one-time, random, domain-bound, chain-bound and expiring. Verification checks the supplied signature through the selected chain verifier before consuming the challenge. Signer policies constrain chain, target, method, value, expiry and owner confirmation. Raw private keys, mnemonics and seed phrases are rejected.
