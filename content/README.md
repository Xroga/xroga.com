# Growth content manifests

This directory is the incremental file-based path for evidence-gated organic assets. Existing TypeScript registries keep their canonical URLs and continue to render current pages. A manifest adds strategy, evidence, sources, visuals, quality, ownership, and freshness without forcing a risky all-at-once migration.

`content/manifests/*.json` is parsed by `growth:content:validate`. A manifest is not publication authority: the existing route must exist, factual claims must resolve through `growth/content/sources.json` and `claims.json`, and its evidence/visual requirements must pass before the asset is production-ready.

Future families may use `content/learn`, `content/blog`, `content/compare`, `content/alternatives`, `content/migrate`, `content/build-with`, `content/build`, `content/research`, `content/benchmarks`, and `content/tools`. No directory or keyword permutation creates a public URL by itself.
