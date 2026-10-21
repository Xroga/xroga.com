# Workspace UI test-contract correction

Base: main 73b1555a0be8064160d603371db90b3dfeac3f92. No production UI behavior changes. Separate from OCI/security implementation and frozen PR803 evidence.

The owning workspace redesign intentionally permits an explicit starter-only plus while retaining the animated ring by default. Fullscreen now shares the current empty-state header/cards and single canonical composer. Two stale assertions are updated to those precise contracts, preserving hydration, restoration, loading, Project-edits exclusion, privacy and single-composer gates. Existing microphone/send assertions are retained.

Focused source-contract tests: 61/61. Local Playwright workspace regression: 9/9 on Node22.21.1, locked Next15.5.21 and Playwright's matching Chromium headless shell. Covers default/starter icon transition, fullscreen entry/exit and draft preservation, private empty state, responsive layouts, themes, menus and mocked conversation transition. External Supabase traffic is aborted. Guest API responses are localhost-only fixtures, not real AI, authentication or provider evidence.

The privacy fixture uses a correctly guest-owned persisted preference. It does not fake an authenticated identity or bypass the cache-owner isolation boundary. Missing ownership correctly purges old preferences.

Before claiming source integration compatibility, authenticate the PR's actual merge parents against then-current main. Do not relabel the older PR803 integration as current-main evidence. No merge or deployment is authorized. Rollback is reverting these test changes, with no application/data/schema rollback required.
