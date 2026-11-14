# OwnPilot source evaluation

The three MIT-licensed source files and LICENSE in this folder are verbatim copies from [OwnPilot at eb4c27f](https://github.com/ownpilot/OwnPilot/tree/eb4c27f29d4d12778621a83e49cd673cd8b62239).

**Evaluation only.** These files have internal OwnPilot imports and are not included in the Xroga runtime bundle or imported from any backend or frontend entry point.

Use them to compare dynamic meta-tool search, help, single/batch dispatch and the Composio adapter against Xroga's existing canonical scheduler, per-tenant permissions, and action-confirmation gates.

Do **not** directly adopt `DEFAULT_USER_ID='default'`, OwnPilot-specific service registries or separate agent orchestration. The Composio MCP plugin skills already vendored by PR #985 remain distinct source and are also not sufficient to enable arbitrary app actions.
