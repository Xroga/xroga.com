# AI App Builder SEO — isolated production-source patch

- Intended domain: https://xroga.com/ai-app-builder
- Current production deployment at patch creation: `dpl_9YVdkEj6cnK38r6djSwsXzwSMHU5`.
- Current production Git commit: `5c337e05fa0bf50de7ce161752709110b278a014`.
- Target: a dedicated `release/xroga-ai-app-seo-production-20261104` branch with that exact original commit.
- Patch: apply only the AI App Builder landing component, capability metadata, and page-scoped CSS from Xroga PR #919, retaining unchanged project runtime and all unrelated production features.
- Source-file baseline proof: all three affected files were byte-identical between the original production Git SHA and the PR #919 pre-change base.
- User-visible primary term: `free ai app builder`. Supporting phrases distributed naturally through answer-oriented sections and FAQ content.
- Commercial claim constraints: $0 starter access has limited capacity, app build completion is not guaranteed within minutes, native iOS/Android publishing is conditional, and search ranking is never guaranteed.
- Evidence regeneration: one-time GitHub Actions run `41806434482` completed successfully and removed its temporary workflow. Generated current-state, egress, runtime and source manifests committed with the patch.
- This evidence-only commit initiates full PR CI on the final source, not a bypass. Merge only after applicable CI and source acceptance pass, then deploy exact verified commit via the authenticated Vercel production project.
- Production verification required: Vercel alias for both xroga.com and www.xroga.com resolves to new deployment ID, exact source sha is tracked, and public page HTML contains new title, description, canonical and H1.
- Rollback: retain deployment `dpl_9YVdkEj6cnK38r6djSwsXzwSMHU5`, which already served the intended production domains; restore it if verification fails.
- The canonical mainline copy remains tracked under PR #919; do not accidentally deploy GitHub `main` over the divergent production source.
