# Framework adapter system

Status: **Implemented**.

`backend/src/synthesis/adapters.ts` selects framework contracts from the required behavior and repository, including initialization, development, tests, production builds, runtime and deployment outputs. Current adapters cover static web, Next.js, Expo, browser extensions and Node CLI. Existing repositories are evolved in place and dependency inventory blocks unresolved incompatible licences or critical vulnerabilities from verified status.
