# Browser Operator release candidate, handover v5 addendum (2026-11-20)

Build commit `f5d7a3be2` (tree clean at build). ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-f5d7a3be2.zip`, SHA-256 `FF3AC106F920AD1B67E87A0146FF8122954410B692F72EC0B9A436FB96B785EA`, manifest `ARTIFACT-MANIFEST-f5d7a3be2.json`. Upgrade from 77c7b32fd: same id, storage kept, worker alive, side panel loads. Unit suite 1416 passed. Install and rollback as in v4 (rollback target: the 77c7b32fd ZIP).

New since v4: the task plan with real milestone states (plan tool, verified checks, recovering and waiting from observed outcomes, side-panel checklist), and the DeepSeek study (`DEEPSEEK-V4-1-FLASH-STUDY-20261120.md`).

Measured (real Chromium, real loop, real DeepSeek): 25/25 earlier regression; plan used 5/5 on a multi-deliverable request and 0/5 on a simple question; a three-page task ended with 3 of 3 milestones verified from page state; 7 of 7 small tasks produced no plan.

Needs your decision, not done:
1. Vision for the product model: CORRECTION to the earlier claim. Staging revision 00146-wod already has `ZURELAY_DEEPSEEK_VISION_VERIFIED=1`, so the staging product already sends screenshots; only my eval harness ran without vision. Nothing was changed. For production, confirm the variable at release. Not yet verified: a signed-in product run showing the model receiving an image.
2. Reasoning escalation. The product sends `none`. Measured none equals high/max on these tasks and the independent benchmark shows 1.4 points between levels, so no change was made.

Still not proven: owner-Chrome signed-in runs of this build, SkillsHub (HTTP 402), concurrent human-input guard, Ads/Meta/Shopify API workers, deliverable file-transfer workflows across authorised apps, and independent security review / PR #997 / production release gates.
