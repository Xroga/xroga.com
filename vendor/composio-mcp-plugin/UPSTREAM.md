# Composio MCP Plugin references

The two skill files and MIT license in this directory are unmodified from
[ComposioHQ/composio-mcp-plugin at bbcb9cc](https://github.com/ComposioHQ/composio-mcp-plugin/tree/bbcb9ccce59090642ca6dad5d6f0fa485c303539).
They are reference documentation, not automatically loaded instructions.
Xroga does not register the upstream hosted MCP server, remote shell, workbench
or unrestricted batch executor from this directory.

Xroga uses the existing Composio session API adapter. The schema-inspection
sequence follows the upstream MCP skill and the
[Composio SDK search response contract](https://github.com/ComposioHQ/composio/blob/fdee7595166f8b5dcff026dc609760d1ce82b2e2/ts/packages/core/src/utils/transformers/toolRouterResponseTransform.ts).
Only the exact connected action candidates allowed by Xroga are considered.
Account ownership, authorization, scheduling, approvals and dispatch remain
with Xroga.

Other references inspected but not vendored:

- [OwnPilot](https://github.com/ownpilot/OwnPilot/tree/eb4c27f29d4d12778621a83e49cd673cd8b62239):
  the plugin's single-user fallback is not appropriate for this service.
- [Codev](https://github.com/shricodev/all-in-one-agent/tree/f6c12d1bf3d1e861a5216b844b1ab1d35a0f0b33):
  chat and connection UX reference only; no repository license was identified.
- [Tool Router Agents](https://github.com/composio-temp/tool-router-agents/tree/f76b98f325c2a4134089c49d8ddd373bbcc39364):
  archived reference only; no repository license was identified.
