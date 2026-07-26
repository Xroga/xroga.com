# Provider adapter system

Status: **Implemented for registered adapters**; **external setup required** for authenticated live checks.

Provider-neutral contracts define supported capabilities, credential ownership, health checks, timeouts, failure normalization and evidence. Payment, communication, AI, DNS and research implementations use these boundaries. Deterministic fixtures cover CI without paid calls. A provider is not shown as connected until an authenticated capability request returns evidence.
