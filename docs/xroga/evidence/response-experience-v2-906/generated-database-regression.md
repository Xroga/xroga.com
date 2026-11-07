# Generated database block regression, 2026-11-01

The authorized new SaaS chat on backend source
`1d487ce977699ba0f049d1227ab8c0b4920d8c1f` returned seven ordered blocks:
narrative, graph, narrative, database, narrative, steps, narrative.
Frontend `85895d2816baf8c475cab8e5d9f534a3b464d2ad` rejected the valid database
contract with `unsupported:database`. The whole message used the legacy renderer
and Copy omitted the graph and table. The authenticated presentation gate itself
was enabled. Reload preserved the payload and reproduced the failure.

The canonical database block has the same read-only columns and rows shape as
the existing table block. V2 now maps it to the existing validated table node.
This adds no database query, mutation, permission, provider request or new renderer.
Unknown action contracts retain the authorization-aware legacy fallback.

The exact synthetic assistant payload is retained in
`frontend/src/components/response-experience-v2/testdata/generated-saas-database.json`.
It is a regression input, not a factual endorsement or production acceptance.
The test reproduced the failure before the correction. Afterward 32 focused
adapter, export and calculation tests passed, including invalid cells/columns,
source order, persistence round-trip and complete graph/table/text export.

Live acceptance remains incomplete. In particular, the model's webhook guidance
does not fully explain crash-safe atomic event processing. Do not present this
captured answer as verified security guidance. The frontend correction needs its
exact-source CI, signed-in Preview and production checks before promotion.

No additional inference was needed to reproduce or correct this renderer defect.
