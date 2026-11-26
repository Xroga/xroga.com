-- Owner-pinned custom MCP tools (RFC-CUSTOM-MCP-EXECUTION, stage 1). Additive; unused while XROGA_CUSTOM_MCP_EXECUTION is off.
-- A row means: this owner reviewed this exact tool definition of this exact server and allows it to be offered to the browser
-- agent behind the normal per-call approval. Stage 1 allows read pins only.
create table if not exists public.custom_mcp_tool_pins (
  user_id uuid not null references auth.users(id) on delete cascade,
  toolkit text not null,
  tool_slug text not null,
  server_url text not null,
  auth_mode text not null,
  definition_digest text not null check (definition_digest ~ '^[0-9a-f]{64}$'),
  risk_class text not null check (risk_class = 'read'),
  max_calls_per_run integer not null default 5 check (max_calls_per_run between 1 and 20),
  confirmation_id uuid,
  pinned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  primary key (user_id, toolkit, tool_slug)
);

create index if not exists custom_mcp_tool_pins_user_active_idx
  on public.custom_mcp_tool_pins (user_id, toolkit)
  where revoked_at is null;

alter table public.custom_mcp_tool_pins enable row level security;

revoke all on public.custom_mcp_tool_pins from anon, authenticated;
grant all on public.custom_mcp_tool_pins to service_role;
