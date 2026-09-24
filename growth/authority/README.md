# Authority evidence imports

This directory is the source layer for Command 4. Empty arrays mean `NO_DATA`, not zero authority.

- `external-sources.json` — independently observed public pages with page-level evidence.
- `creators.json` — observed creator/reviewer records.
- `communities.json` — observed public discussion opportunities.
- `outreach.json` — manually authorized draft/sent state; never an automatic sender.
- `receipts.json` — strict owned/earned authority outcomes.
- `satellites.json` — evidence-based open-source artifact decisions.
- `github.json` — dated GitHub repository observation.
- `skills/` — outcome contracts backed by real tools.

Never import scraped private contact details, credentials, private repository information, fabricated metrics or unverified success. `VERIFIED_MENTION` and `VERIFIED_LINK` require an independently visible public URL and verification date.
