# Workspace OpenUI candidate

The OpenUI renderer uses the existing authenticated response audience. Set `RESPONSE_OPENUI=1` only on the approved Preview with its verified Xroga API. Keep the environment value unset or zero for the existing presentation. The renderer uses completed, validated DeepSeek response data. It reads the same stored and shared response formats as the current Workspace.

The clean `main` base at `6652ea3765540b2f78a7cf8bc4ac70e3d184b643` reproduced four account/sidebar and conversation-menu regression failures. It also failed the mission ancestry check for `local-multilingual-dictation-20261030.json`, whose recorded source `d7ce7def4ab94a72587907cb4f60690d7f288838` is outside that base's history. Both gates require review before staging or promotion.

## Acceptance on the reviewed source

1. Pin the frontend and paired backend to the reviewed Git SHAs and capture the Preview URL, current production aliases, frontend rollback deployment, and API/Job recovery image. Run the mandatory source and integrated-candidate CI gates before proceeding.
2. Use the existing authorized test account and sign-in flow in Preview. Check the authenticated audience, a saved conversation, the authorized rich share, and a denied private share with the second account.
3. Under a separately approved cap, run fresh DeepSeek answers for a simple question, a sourced comparison, a SaaS architecture, a supplied-data chart, a deterministic calculator, and a coding question with an attachment. Keep the original request IDs, model usage and ledger receipts. Stop on unknown usage, unexpected dispatches or failed acceptance.
4. Check response order, chart units and exact values, the diagram's explicit connections, approved source links and accessible controls. Compare actual desktop and mobile screenshots in light and dark themes. Check streaming, keyboard input, errors, Copy, Share and Reopen. Confirm the visible interactions and Share replay do not dispatch a model request.
5. Record load and interaction measurements against the previous renderer using the same responses and repeat enough times to separate cold startup from warm interaction. Record any fallback and the input that triggered it.

## Rollback

If the rendering check fails, keep `RESPONSE_OPENUI` off in the replacement build or restore the last verified frontend alias. Existing conversations, snapshots and calculator state use the existing formats. The backend prompt change can roll back independently through the established exact-source paired API/Job release procedure. Obtain source-bound authorization before any production promotion, maintenance, SQL or paid model tests.
