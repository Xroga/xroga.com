#!/usr/bin/env bash
# Prints the facts that decide whether a sandbox or egress-isolation result can be labelled for THIS host. Read-only: it changes nothing.
# Output is one JSON object. No credential is read and none is printed.
#
#   bash deploy/browser-worker/host-facts.sh > host-facts.json
#
# On Google Compute Engine the metadata server answers with the machine type, zone and CPU platform: non-secret facts that make the label
# GCE_HOST_TESTED honest. Anywhere else those fields are null and the label must not say GCE.
set -u
j() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1" 2>/dev/null || printf '"%s"' "$1"; }
sysctl_val() { sysctl -n "$1" 2>/dev/null || cat "/proc/sys/${1//./\/}" 2>/dev/null || echo null; }
gce() {
  curl -fsS --max-time 3 -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/instance/$1" 2>/dev/null || true
}
mtype=$(gce machine-type); zone=$(gce zone); cpu=$(gce cpu-platform)
os=$( (. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}") || echo unknown)
docker_ver=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo null)
seccomp=$(docker info --format '{{json .SecurityOptions}}' 2>/dev/null || echo null)
cat <<JSON
{
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "arch": $(j "$(uname -m)"),
  "kernel": $(j "$(uname -r)"),
  "os": $(j "$os"),
  "docker": $(j "$docker_ver"),
  "dockerSecurityOptions": ${seccomp:-null},
  "userNamespaces": {
    "user.max_user_namespaces": $(j "$(sysctl_val user.max_user_namespaces)"),
    "kernel.unprivileged_userns_clone": $(j "$(sysctl_val kernel.unprivileged_userns_clone)"),
    "kernel.apparmor_restrict_unprivileged_userns": $(j "$(sysctl_val kernel.apparmor_restrict_unprivileged_userns)")
  },
  "gce": {
    "machineType": $( [ -n "$mtype" ] && j "${mtype##*/}" || echo null ),
    "zone": $( [ -n "$zone" ] && j "${zone##*/}" || echo null ),
    "cpuPlatform": $( [ -n "$cpu" ] && j "$cpu" || echo null )
  }
}
JSON
