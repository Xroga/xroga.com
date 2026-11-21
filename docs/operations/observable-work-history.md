# Observable work history

Use existing events for a single live status and expandable Work history in Workspace.

The previous upstream audit identified compact disclosures in assistant-ui, active versus settled tool states in TUFFUI, event-driven UI in CopilotKit and approval interrupts in LangStage. The presentation applies those patterns to Xroga's existing event adapters and theme. It introduces no dependency, duplicate agent runtime or private model reasoning.

Waiting is shown without a claimed operation. Writing requires visible response text. Recorded operations can be expanded after the answer, and missing completion events do not imply success.

The [mission manifest](../xroga/missions/workspace-observable-work-history.json) records scope and release limits.
