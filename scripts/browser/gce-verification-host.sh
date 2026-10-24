#!/usr/bin/env bash
# Temporary Google Compute Engine hosts for the Phase 2 browser-host verification (replaces the dropped OCI host).
#
#   bash scripts/browser/gce-verification-host.sh preflight              # read-only: zones, machine types, quota
#   bash scripts/browser/gce-verification-host.sh create amd64|arm64     # one VM; founder-approved only
#   bash scripts/browser/gce-verification-host.sh teardown               # deletes every resource this script created
#
# Environment: GCP_PROJECT, SSH_PUBKEY_FILE (create), OPERATOR_CIDR (create, e.g. 203.0.113.7/32), GCLOUD (default "gcloud").
# Safety: a dedicated custom VPC (never the default network) whose only ingress is SSH from OPERATOR_CIDR; the VM has NO service
# account and no API scopes, so nothing on it can call Google Cloud; project SSH keys are blocked; every VM deletes itself after
# 4 hours (--max-run-duration) even if teardown is forgotten. All resources carry the label purpose=xroga-phase2-verification.
set -euo pipefail
G="${GCLOUD:-gcloud}"; P="${GCP_PROJECT:?GCP_PROJECT}"
REGION=us-central1; ZONE=us-central1-a   # T2A (Arm) is offered in us-central1-a/b/f; both VMs use the same zone
NET=xroga-verify-net; SUBNET=xroga-verify-subnet; FW=xroga-verify-ssh; LABEL=purpose=xroga-phase2-verification
declare -A TYPE=([amd64]=e2-standard-2 [arm64]=t2a-standard-2)
declare -A FAMILY=([amd64]=ubuntu-2404-lts-amd64 [arm64]=ubuntu-2404-lts-arm64)

case "${1:-}" in
  preflight)
    "$G" services list --project "$P" --enabled --format='value(config.name)' | grep -qx compute.googleapis.com || { echo "compute.googleapis.com is not enabled"; exit 3; }
    for a in amd64 arm64; do
      printf '%s %s in %s: ' "$a" "${TYPE[$a]}" "$ZONE"
      "$G" compute machine-types describe "${TYPE[$a]}" --zone "$ZONE" --project "$P" --format='value(guestCpus,memoryMb)' 2>/dev/null || echo "NOT OFFERED"
    done
    "$G" compute regions describe "$REGION" --project "$P" --flatten=quotas --format='csv[no-heading](quotas.metric,quotas.limit,quotas.usage)' \
      | grep -E '^(CPUS|T2A_CPUS|E2_CPUS|SSD_TOTAL_GB|DISKS_TOTAL_GB|IN_USE_ADDRESSES|INSTANCES),' || true
    "$G" compute project-info describe --project "$P" --flatten=quotas --format='csv[no-heading](quotas.metric,quotas.limit,quotas.usage)' | grep -E '^(CPUS_ALL_REGIONS|NETWORKS|FIREWALLS),' || true
    ;;
  create)
    a="${2:?amd64|arm64}"; [ -n "${TYPE[$a]:-}" ] || { echo "unknown arch $a"; exit 2; }
    : "${SSH_PUBKEY_FILE:?}" "${OPERATOR_CIDR:?}"
    [[ "$OPERATOR_CIDR" =~ /32$ ]] || { echo "OPERATOR_CIDR must be a single address (/32)"; exit 2; }
    "$G" compute networks describe "$NET" --project "$P" >/dev/null 2>&1 || "$G" compute networks create "$NET" --project "$P" --subnet-mode=custom
    "$G" compute networks subnets describe "$SUBNET" --region "$REGION" --project "$P" >/dev/null 2>&1 || \
      "$G" compute networks subnets create "$SUBNET" --project "$P" --network "$NET" --region "$REGION" --range 10.90.0.0/24
    "$G" compute firewall-rules describe "$FW" --project "$P" >/dev/null 2>&1 || \
      "$G" compute firewall-rules create "$FW" --project "$P" --network "$NET" --direction INGRESS --action ALLOW --rules tcp:22 --source-ranges "$OPERATOR_CIDR"
    "$G" compute instances create "xroga-verify-$a" --project "$P" --zone "$ZONE" --machine-type "${TYPE[$a]}" \
      --image-project ubuntu-os-cloud --image-family "${FAMILY[$a]}" --boot-disk-size 20GB --boot-disk-type pd-balanced --boot-disk-auto-delete \
      --subnet "$SUBNET" --no-service-account --no-scopes --labels "$LABEL" \
      --max-run-duration 4h --instance-termination-action DELETE \
      --metadata "block-project-ssh-keys=true,enable-oslogin=false,ssh-keys=xroga:$(cat "$SSH_PUBKEY_FILE")"
    "$G" compute instances describe "xroga-verify-$a" --zone "$ZONE" --project "$P" --format='value(networkInterfaces[0].accessConfigs[0].natIP)'
    ;;
  teardown)
    for a in amd64 arm64; do "$G" compute instances delete "xroga-verify-$a" --zone "$ZONE" --project "$P" --quiet 2>/dev/null || true; done
    "$G" compute firewall-rules delete "$FW" --project "$P" --quiet 2>/dev/null || true
    "$G" compute networks subnets delete "$SUBNET" --region "$REGION" --project "$P" --quiet 2>/dev/null || true
    "$G" compute networks delete "$NET" --project "$P" --quiet 2>/dev/null || true
    echo "left with label $LABEL:"; "$G" compute instances list --project "$P" --filter="labels.purpose=xroga-phase2-verification" --format='value(name)'
    "$G" compute disks list --project "$P" --filter="name~^xroga-verify" --format='value(name)'
    ;;
  *) echo "usage: $0 preflight | create amd64|arm64 | teardown"; exit 2;;
esac
