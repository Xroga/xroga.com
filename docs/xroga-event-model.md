# Xroga UI/UX Step 1 Event Model

`XrogaCanonicalEvent` is a versioned, source-neutral frontend contract. It does not replace the persisted swarm stream or Software Agent V2 event store.

- Swarm SSE is normalized by `terminalEventAdapter`.
- Agent V2 events pass through the same adapter.
- Existing `TerminalEvent` consumers remain compatible through the attached `canonical` event.
- Stable backend sequence and event IDs are retained when supplied. Client-derived IDs are deterministic within the received run event when older payloads omit them.
- Reconnection remains deduplicated by the existing persisted stream sequence and append-only reducer.
- Metadata is allowlisted. Provider payloads, system prompts, secrets, and private reasoning are not copied.

The public types cover run, plan, activity, message, tool, state, evidence, artifact, file, approval, connection, subagent, verification, receipt, and notification events. Producers are not required to emit every type immediately.

Future transports implement `XrogaCanonicalEventAdapter<T>`. Components consume the canonical event rather than transport-specific payloads.
