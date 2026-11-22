# Workspace search ranking dependency

Xroga integrates the unmodified [MiniSearch v7.2.0 npm package](https://www.npmjs.com/package/minisearch/v/7.2.0). The version is pinned in both relevant npm locks. Upstream source is [lucaong/minisearch at `3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5`](https://github.com/lucaong/minisearch/tree/3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5); its [MIT license and copyright notice](https://github.com/lucaong/minisearch/blob/3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5/LICENSE.txt) are included in the distribution. Preserve this notice when redistributing the package.

MiniSearch ranks bounded candidates in memory. The search records come from Xroga’s existing owner-scoped Supabase queries. Neither Xroga workspace data nor search queries are sent to the dependency maintainer or another search service.
