#!/usr/bin/env bash
# Idempotent Cursor Cloud update script (runs from repo root).
set -euo pipefail

echo "==> Installing workspace dependencies"
npm install

echo "==> Ensuring local env files exist"
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "    created backend/.env from .env.example"
else
  echo "    backend/.env already present"
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.local.example frontend/.env.local
  # Point the Next.js app at the local Express API (example uses production Fly URL).
  if grep -q '^NEXT_PUBLIC_API_URL=' frontend/.env.local; then
    sed -i 's|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://localhost:8080|' frontend/.env.local
  else
    printf '\nNEXT_PUBLIC_API_URL=http://localhost:8080\n' >> frontend/.env.local
  fi
  echo "    created frontend/.env.local (API → http://localhost:8080)"
else
  echo "    frontend/.env.local already present"
fi

echo "==> Cursor Cloud install complete"
echo "    Backend:  npm run dev:backend  (port 8080)"
echo "    Frontend: npm run dev:frontend (port 3000)"
echo "    Health:   curl http://localhost:8080/health"
