# Private verification host egress, specific amendment

Status: REQUESTED, NOT APPROVED. The previously approved two-hour window has
not started. This request does not extend it or increase its $2 total ceiling.

## Demonstrated prerequisite

Read-only Google API inspection on October 31 found no Cloud Routers in
`us-central1`, no NAT for `xroga-verify-net`, and no proxy/instance next hop.
`xroga-verify-subnet` has Private Google Access disabled. Its default Internet
gateway route alone cannot give a VM without an external address Internet
access. The approved private VM cannot currently fetch its images/source or
execute the required real public-browser positive test.

The reviewed host requires isolated Docker networking and its production egress
proxy. Private Google Access alone would not permit public websites. Giving the
VM a public address would change its approved private-only architecture. No
existing reusable egress service or router was found in that region and VPC.
Reusing the existing VPC and one temporary Public NAT preserves the host boundary.

## Exact addition

Project `project-c40d4821-e647-4fa2-92d`, region `us-central1` only:

- Reserve one regional external IPv4 address,
  `xroga-b15-stage-nat-ip-20261031`.
- Create Cloud Router `xroga-b15-stage-router-20261031` in the existing
  `xroga-verify-net` network. No BGP sessions or advertised routes.
- Configure its Public NAT `xroga-b15-stage-nat-20261031` with only the named
  address and only the primary IP range of `xroga-verify-subnet`,
  `10.90.0.0/26`. This subnet has no existing VM. The approved single test VM
  remains private, without external IP or public SSH.
- No new IAM, inbound firewall rule, production/API subnet NAT, DNS, secret,
  service, model call or production activation is included.

NAT provides outbound connections and their responses, not unsolicited Internet
ingress. The browser's existing internal Docker network, SSRF policy and
per-job egress proxy remain mandatory and are tested unchanged.

## Cost and cleanup

Same existing window, cleanup starts at 90 minutes, no later than two hours.
For one VM and one NAT IP, Google's rates are $0.0014/hour gateway plus
$0.005/hour address, or $0.0128 for two hours, and $0.045/GiB processed.
Allow up to $0.25 of the existing $2 total for this addition, including bounded
image downloads and small test traffic. No increased spending allowance or
retained production NAT is requested. Stop before the total allowance is used.

At cleanup, delete the test VM first, remove this router/NAT, release the exact
reserved address and verify all three are gone. The local independent cleanup
watchdog handles this alongside the previously approved resources. The VM's
native automatic deletion remains the independent compute backstop. If the
laptop becomes unavailable, the router/IP can continue costing money until
deleted, so the cleanup receipt must verify removal rather than assume it.

Rollback removes only these new resources. Existing production routing, voice,
API/Job pairing, queues, data and recovery assets stay unchanged.

Sources checked October 31:
[Google NAT pricing](https://cloud.google.com/nat/pricing) and
[Public NAT behavior](https://docs.cloud.google.com/nat/docs/public-nat).
