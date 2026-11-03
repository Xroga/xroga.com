# Existing Zurelay key restriction and secret-custody decision

PREPARATION ONLY. No approval is inferred from the account balance, the engineering directive or prior releases. This decision does not approve a production cutover or a model request.

## Exact account action

Use only the existing Zurelay key named `xroga models`, masked prefix `zr_live_RhIG`, currently active and never used at the observation. Edit its existing rules, without creating or rotating a key:

- Allow only `deepseek-v4.1-flash-1017` and `claude-sonnet-5-5`.
- Explicitly turn key smart routing off instead of inheriting the workspace setting.
- Set both daily and monthly USD limits to $0.01 for initial verification custody. Set the request rate to one per minute. Do not enable auto-recharge or add credit.
- Read back the saved rules. If the provider cannot enforce the exact restrictions or these limits, stop and report it. Do not silently choose larger limits.

The application independently checks the exact model, endpoint, task authority, reservation, response model and terminal receipt. The second allowlisted model still requires a current task-specific Sonnet permit. A key rule never supplies that permit. These deliberately small initial limits are not the production service allowance.

## Exact existing Google secret

Project `project-c40d4821-e647-4fa2-92d`, existing Secret Manager secret `xroga_models_zurelay`, enabled version `1`, resource `projects/574998934848/secrets/xroga_models_zurelay/versions/1`.

Authorize the operator to read that one version into process memory for a non-outputting credential-format and masked-prefix comparison. Do not reveal, copy to the clipboard, log or commit its value. A matching masked prefix is only an identity consistency check, not proof of provider authentication. If it does not match the intended existing key, stop. No new key or secret version is included.

Authorize `roles/secretmanager.secretAccessor` only on this existing secret for `serviceAccount:xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`. Do not grant project-wide Secret Manager permissions, grant another identity or change KMS. Read the resource policy before and after and preserve an exact binding rollback receipt. If the exact binding already exists, reuse it.

No API revision, canonical Job, queue, SQL, DNS, frontend, voice route or active production secret reference is changed by this setup. A later approved deployment would pin version 1 as backend-only `ZURELAY_API_KEY` through the existing loader. There is no new service or recurring resource requested here. This setup authorizes $0 in inference spending. The displayed provider balance is not test permission.

## Stop and rollback

No inference, key reveal, credential transfer, schema operation or production traffic change is permitted by this decision. Stop on unexpected key identity, rule drift, missing permission or an unexpected charge. Restore the prior key-rule values only if needed for a safe correction, never broaden model access to recover an application request. Remove only the newly added exact secret IAM member if setup fails and no authorized deployment depends on it. Preserve historical credentials and financial records until their separate retirement is approved.

The founder guide, sections 2 and 9, requires this specific credential/configuration approval. The browser confirmation policy also requires action-time confirmation before granting new runtime credential access. A separately reviewed single-request probe and exact-source release remain required after CI and application gates pass.
