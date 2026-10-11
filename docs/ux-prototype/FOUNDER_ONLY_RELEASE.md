# Founder-only OS preview release amendment

The `/os-preview` route family (including the journey, rich-results gallery, sections, and Founder Operations) is now private. This does **not** change `/workspace`.

Every preview page uses a no-store server layout that revalidates the Supabase user, confirmed canonical `hello@xroga.com` email, server-owned `owner` role, and AAL2 MFA. The Founder Operations page also rechecks independently. Authentication or authorization failure renders no preview content. This is authorization, not merely a hidden link.

The former `generateStaticParams` output for `/os-preview/[section]` was removed; the entire namespace must be dynamic in the production build. A static route would bypass the request-scoped access gate and is a stop-ship defect.

The public marketing header no longer advertises the preview. Robots and route inventory mark the entire namespace private. The preview remains an interactive simulation; no planned backend engine becomes production functionality by merging this change.

The existing unauthenticated Playwright interaction suites require a separately provisioned, isolated TEST founder AAL2 storage state (`OS_PREVIEW_FOUNDER_STORAGE_STATE`) to run after this policy change. They explicitly skip with that reason when absent. The new guest-denial suite remains runnable without credentials. Do not use a production founder session or production Supabase service-role key for tests. The pre-existing authenticated-browser CI check still requires a dedicated TEST Supabase project and must not be bypassed to force a merge.
