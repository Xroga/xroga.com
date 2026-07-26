# Production evidence

- Vercel: production deployment `dpl_23dvMmY6H7X1YTA9iH9zihMnoNUa`, commit `8d96593…`, state READY.
- Vercel runtime query: no grouped errors in the queried 24-hour window; status counts included 80 × 307 and 11 × 200.
- GitHub: Fly run `30198298053` and frontend build run `30198298062` succeeded for the same commit.
- HTTP: `xroga.com`, API `/health`, and API `/api/health` returned 200; `/ready` returned 404; `/metrics` was publicly reachable; `www.xroga.com` did not resolve.

These observations predate deployment of this branch and do not prove its production behavior.
