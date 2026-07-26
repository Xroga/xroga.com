# Release manifest

Every release is identified by commit SHA plus a SHA-256 artifact digest, build command, successful exit code, environment, and creation time. Failed builds cannot create a release. Provider deployment IDs and verification evidence are stored separately so provider state is never confused with application health.
