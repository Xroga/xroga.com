# Release manifest

Every release is identified by commit SHA plus a SHA-256 artifact digest, build command, successful exit code, environment, and creation time. Failed builds cannot create a release. Provider deployment IDs and verification evidence are stored separately so provider state is never confused with application health.

For production promotion, bind the manifest to the
[pre-traffic-shift evidence package](pre-traffic-shift-verification.md), including
required CI and functional receipts, per-component source/image identities,
non-secret configuration fingerprint, current/candidate revisions, canonical
API/Job compatibility and a verified rollback. Record limitations and outstanding
conditions explicitly. Never include plaintext secret values in a manifest.
