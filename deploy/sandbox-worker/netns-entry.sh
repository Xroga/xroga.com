#!/bin/sh
# First process of a restricted-network stage, inside the new namespaces. Brings up loopback only, starts the bridge to the allowlisting
# proxy socket ($1), waits until it accepts connections, then replaces itself with the job. When the job (the namespace's first process) ends,
# the kernel kills the bridge and everything else in the namespace.
SOCK="$1"; shift
ip link set lo up || exit 125
node /app/egress-bridge.mjs "$SOCK" &
i=0
while [ "$i" -lt 40 ]; do
  node -e 'require("net").connect(3128,"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))' && break
  i=$((i+1)); sleep 0.1
done
exec "$@"
