# Collector self-test (not acceptance evidence)
`collect-host-evidence.sh AMD64_HOST_TESTED` run end to end on the developer machine's Docker Desktop (WSL2 VM, x86_64) at commit `1043426f`, clean tree.
Evaluator: HOST_ACCEPTED, 32 of 32. It proves the collector, the probe, the isolation battery and the evaluator work together on a real Docker engine.
It is the same environment as the existing DOCKER_LOCAL_TESTED evidence and closes neither B-1 (OCI) nor B-2 (native ARM64).
