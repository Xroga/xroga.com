-- Composio multi-account: the connected account a user chose as the default for each app, so chat
-- actions and automations act as the account the user meant when several are connected.
-- Additive only. Not applied by this change; apply through the verified migration workflow after review.
-- The feature is off (XROGA_COMPOSIO_MULTI_ACCOUNT unset) and nothing reads this table until it is enabled.
-- Rollback: DROP TABLE public.composio_default_accounts (nothing else references it).
--
-- Only the Composio connected-account ID (a public identifier, never a credential) is stored. The server
-- re-checks on every use that the ID is still one of the owner's own active private accounts at Composio.

CREATE TABLE IF NOT EXISTS public.composio_default_accounts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  toolkit TEXT NOT NULL CHECK (toolkit ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  connected_account_id TEXT NOT NULL CHECK (connected_account_id ~ '^[A-Za-z0-9_-]{4,64}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, toolkit)
);

ALTER TABLE public.composio_default_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS composio_default_accounts_owner_select ON public.composio_default_accounts;
CREATE POLICY composio_default_accounts_owner_select ON public.composio_default_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.composio_default_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.composio_default_accounts TO authenticated;
GRANT ALL ON TABLE public.composio_default_accounts TO service_role;

NOTIFY pgrst,'reload schema';
