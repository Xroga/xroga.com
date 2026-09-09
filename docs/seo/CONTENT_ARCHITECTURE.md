# SEO content architecture

## Published factories and seed sets

- `/compare/xroga-vs-{competitor}`: six hand-verified seed pages.
- `/alternatives/{competitor}-alternative`: four differentiated shortlists.
- `/build/{app-type}`: eight production-minded use-case guides.
- `/build-with/{integration}`: six provider-specific boundary guides.
- `/blog/{slug}`: five editorial guides.
- `/learn/{term}`: one production-readiness guide; `/glossary` is deliberately not used.

The application uses typed registries with statically generated detail routes. Publication requires a complete record; adding a slug to a filename or keyword list does not create an indexable page.

## Deliberately unpublished factories

The approved future namespaces `/stack/{technology}`, `/how-to/{category}/{task}`, `/templates/{slug}`, and `/migrate/{competitor}-to-xroga` are retained in the roadmap but not published in this release. They need first-party implementation evidence, screenshots, tested procedures, or migration data before they would deserve to exist without search engines.

## Editorial quality gate

Before a new record enters an indexable registry it must have a unique intent, title, description, H1, substantial visible answer, correct canonical, useful internal links, and verified claims. Competitor content additionally requires official source URLs and `lastVerified`. Pages that only swap a noun must remain unpublished.

## Cannibalisation rules

- `/vibe-coding` serves commercial/category intent; `/blog/what-is-vibe-coding` serves the definition.
- `/compare/*` answers head-to-head evaluation; `/alternatives/*` maps multiple valid options.
- `/integrations` is the product hub; `/build-with/*` explains provider implementation boundaries.
- Existing `/build-saas-with-ai` remains the SaaS commercial page until a measured migration to `/ai-saas-builder` is justified.
