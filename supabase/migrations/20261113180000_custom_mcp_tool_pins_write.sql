-- Stage 2 of RFC-CUSTOM-MCP-EXECUTION: a pin may also be for a tool that changes data (owner decision, 2026-11-13).
-- Destructive and financial tools stay unpinnable; every call still needs its own exact approval. Additive: a constraint is widened.
alter table public.custom_mcp_tool_pins drop constraint if exists custom_mcp_tool_pins_risk_class_check;
alter table public.custom_mcp_tool_pins add constraint custom_mcp_tool_pins_risk_class_check check (risk_class in ('read','write'));
