# Command 3B automation policy

Rules are durable, versioned and disabled by default. A signal is matched against explicit conditions and exclusions, then checked for emergency stop, duplicate trigger digest, active maintenance restrictions and the configured run window. Low/medium safe work can create an action; high/critical rules are accepted only when their action definition requires independent approval.

Automation never mutates a provider directly. It creates the same durable safe action used by human operators, so confirmation, permissions, approval, locks, target-version checks, bounded attempts, provider execution, verification, evidence and audit remain mandatory. Duplicate signals return the existing run; rate-limited, stopped, disabled and maintenance-blocked decisions are persisted truthfully.
