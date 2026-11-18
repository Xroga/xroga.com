#!/bin/sh
# First process of a restricted-network stage, inside the new namespaces. Brings up loopback only, starts the bridge to the allowlisting
# proxy socket ($1), waits until it accepts connections, then replaces itself with the job. When the job (the namespace's first process) ends,
# the kernel kills the bridge and everything else in the namespace.
# The helper programs used here are found on the SYSTEM path only; the job's own PATH (which may include run-local bin directories) is restored
# just before the job starts.
JOB_PATH="$PATH"
PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SOCK="$1"; shift
ip link set lo up || exit 125
node /app/egress-bridge.mjs "$SOCK" &
i=0
while [ "$i" -lt 40 ]; do
  node -e 'require("net").connect(3128,"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))' && break
  i=$((i+1)); sleep 0.1
done
PATH="$JOB_PATH"
exec "$@"
