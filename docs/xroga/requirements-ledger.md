# Canonical Xroga requirements ledger

Application source SHA: `e9543986c10331ef2795920ebf60d3494ee7f1aa`. This is **available-source reconciliation**, not completion of the original 119-feature/72-mission source coverage. All missing inputs remain `INACCESSIBLE_PENDING_EXPORT`. Historical source assertions are preserved without treating them as current proof.

264 requirements; 264 available source rows mapped; 43 mandatory capability families; 23 external candidates; zero newly adopted runtime dependencies.

| Requirement | Title | Current state | Owner command | Disposition |
| --- | --- | --- | --- | --- |
| XB01-C001 | XROGA REPOSITORY TRUTH MAP AND ARCHITECTURE INVENTORY | IMPLEMENTED_AND_REACHABLE | 001 | KEEP |
| XB01-C002 | XROGA RESEARCH-TO-CODE REQUIREMENTS RECONCILIATION | IMPLEMENTED_BUT_UNVERIFIED | 002 | EXTEND |
| XB01-C003 | DETERMINISTIC BUILD, TEST, MIGRATION AND CI BASELINE | IMPLEMENTED_BUT_UNVERIFIED | 003 | EXTEND |
| XB01-C004 | DEPLOYMENT, RUNTIME AND EXTERNAL DEPENDENCY TRUTH | IMPLEMENTED_BUT_UNVERIFIED | 004 | EXTEND |
| XB01-C005 | END-TO-END GOLDEN USER JOURNEY AND ACCEPTANCE HARNESS | IMPLEMENTED_BUT_UNVERIFIED | 005 | EXTEND |
| XB01-C006 | XROGA ENGINEERING OPERATING CONTRACT AND DEFINITION OF DONE | IMPLEMENTED_BUT_UNVERIFIED | 006 | EXTEND |
| XB01-C007 | TENANT ISOLATION, SERVER-SIDE OWNERSHIP AND RBAC BASELINE | PROPOSED_ONLY | 007 | NEW |
| XB01-C008 | CANONICAL OUTCOME-SCOPED AUTHORITY, APPROVAL AND PREPARED-ACTION CONTRACT | PROPOSED_ONLY | 008 | NEW |
| XB01-C009 | CREDENTIAL VAULT, ENVELOPE ENCRYPTION, ROTATION AND CONNECTED-ACCOUNT IDENTITY | PROPOSED_ONLY | 009 | NEW |
| XB01-C010 | TOOL TRUST, DATA EGRESS, SSRF AND UNTRUSTED-INPUT SECURITY GATEWAY | PROPOSED_ONLY | 010 | NEW |
| XR-FAMILY-repository-truth | repository truth | IMPLEMENTED_BUT_UNVERIFIED | 001 | EXTEND |
| XR-FAMILY-research-traceability | research traceability | IMPLEMENTED_BUT_UNVERIFIED | 002 | EXTEND |
| XR-FAMILY-deterministic-ci | deterministic CI | IMPLEMENTED_BUT_UNVERIFIED | 003 | EXTEND |
| XR-FAMILY-deployment-dependencies | deployment dependencies | IMPLEMENTED_BUT_UNVERIFIED | 004 | EXTEND |
| XR-FAMILY-golden-journeys | golden journeys | PROPOSED_ONLY | 005 | NEW |
| XR-FAMILY-engineering-rules | engineering rules | IMPLEMENTED_BUT_UNVERIFIED | 006 | EXTEND |
| XR-FAMILY-tenant-isolation | tenant isolation | IMPLEMENTED_BUT_UNVERIFIED | 007 | EXTEND |
| XR-FAMILY-authority-approval | authority/approval | IMPLEMENTED_BUT_UNVERIFIED | 008 | EXTEND |
| XR-FAMILY-credentials | credentials | IMPLEMENTED_BUT_UNVERIFIED | 009 | EXTEND |
| XR-FAMILY-egress-security | egress security | PROPOSED_ONLY | 010 | NEW |
| XR-FAMILY-canonical-durable-execution | canonical durable execution | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-schedulers | schedulers | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-cost-budget | cost/budget | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-provenance-evidence | provenance/evidence | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-webhook-replay-idempotency | webhook replay/idempotency | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-long-running-work | long-running work | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-multi-intent-requests | multi-intent requests | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-user-intent-relevance | user intent/relevance | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-composio-dynamic-tools | Composio/dynamic tools | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-browser-execution | browser execution | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-github-coding | GitHub coding | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-sandboxes | sandboxes | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-activity-feeds | activity feeds | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-xroga-blocks | Xroga Blocks | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-rich-ai-ui | rich AI UI | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-products-flights-hotels-maps-cards-results | products/flights/hotels/maps/cards/results | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-file-uploads | file uploads | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-workflow-work-packs | workflow/work packs | PLACEHOLDER | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-activepieces | Activepieces | PLACEHOLDER | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-ai-employees | AI Employees | PLACEHOLDER | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-app-site-creation | app/site creation | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-deployment | deployment | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-android-ios-publishing | Android/iOS publishing | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-paid-managed-publishing | paid managed publishing | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-billing | billing | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-web-research-citations | web research/citations | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-seo | SEO | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-drive-docs-slides-sheets | Drive/docs/slides/sheets | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-security | security | IMPLEMENTED_BUT_UNVERIFIED | 010 | EXTEND |
| XR-FAMILY-observability | observability | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-verification | verification | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-recovery | recovery | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-FAMILY-completion-semantics | completion semantics | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-1d23f5e287d7c47e | Persisted execution runs | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-ee2bb56013991c0a | Persisted executable task graphs | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-d2b95b8ab37a5600 | Dependency-aware scheduling | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-6892fb9433b14aad | Restart and reconnect recovery | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-53e9c1e14951032e | One canonical execution state | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-736be0ed321fa33c | Path-safe atomic repository mutations | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-6fe8f417da87c5f6 | Safe patch application | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-e50b2c14451612e7 | Model routing contracts | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-53ca818c3ef76663 | Reviewer execution contracts | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-5df7496fb3a5f401 | Provider failover contracts | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-e6cf149e61d25423 | Focused on-demand repository context | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-27b970247139ab92 | Iterative task-by-task implementation | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-a44f4c10d02cfc90 | Isolated generated-code execution | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-4d8bfff0b15fa007 | Validation and repair loops | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-43547991f9057030 | Production build gates | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-2b88753d559b8ac9 | Truthful runtime events | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-fbb439eb87f8da71 | Evidence-backed final outcomes | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-df43e18ee33f3b37 | Generated code never receives Xroga control-plane secrets | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-a927b8bddceac355 | Repositories private by default; public only on explicit literal user choice | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-65ec83a77db018d6 | GitHub 422 classified by actual cause | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-c9f149ab256173f3 | Writes resolve the exact target branch, never silently fall back to main | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-3b39374d96fbdef6 | Existing-repo mutation is one tree, one commit, one non-force ref update, or no change | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-1b34b7570a9bc308 | Protected/default branch writes need authorization or use xroga/<run-id> + PR | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-8cc6dfd992f001ab | Empty or ambiguous SEARCH patches cannot wipe or modify the wrong file | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-659722bb419d7565 | Supabase request-storm fixes from PR #460 remain intact | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-4ef718233b6beb22 | Remove the complete-product one-shot generation dependency | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-b1ec28072e1c1c31 | Resume from the last durable checkpoint without regenerating verified tasks | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-3fd852b5db2d92b5 | Black-box fixture proving multi-task construction of a >=40 file application | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-3f482597bc0627db | Resolve exact remote HEAD and record the source commit before every write | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-e57a21308cb9f658 | Repository tool suite (list_tree, search_code, search_symbol, read_file, read_file_range, read_imports, read_git_diff, read_test_failure, inspect_blob_sha, write_file, apply_patch, propose_delete, inspect_resulting_diff) | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-37c5e81af1c33df6 | Remove fixed-path repository hydration as the primary context mechanism | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-f0043b418b73d4f8 | Project memory may summarise but must not replace the exact GitHub tree | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-3723ddfc0ca1c37d | Every update carries or derives the expected base blob SHA | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-ebf2e15385c92a68 | Transactional patch workspace based on the exact source commit | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-8971b6c0f17d21fd | A failed patch or validation leaves the GitHub branch unchanged | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-aef834b1f612ebfe | Generated code never executes directly on the Xroga API host | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-b17fd08d7cda3194 | Isolated execution-provider architecture supporting a disposable sandbox worker | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-4a50673da87cbaba | Container limits: unprivileged user, read-only base, disposable fs, CPU/memory/disk/process caps, timeout, output cap | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-41625eae56eadfc7 | Network disabled by default; registry access only during dependency install | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-074dce50b4447e16 | Sentinel-secret isolation test and network-denial test | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-853fd3214b7e0e56 | Live production isolated worker | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-8ac61426df550fd6 | Keyword classification only as a fallback guard | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-5365d36c7dc6e0e9 | Unknown products must not default to static HTML | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-165c860938a8bc6f | Remove every premature success state; the pre-QA preview must not use buildOk: true | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-d3911a439e82c686 | One canonical verification lifecycle shared by backend and frontend | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-da5d8bdf8e9fa8ab | Executable verification is the main gate; model review is supplemental | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-2dfcd3ec0cf6cf4f | Reviewer output parsing fails closed | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-2cc23773d8820e2b | Reviewer must not inspect only an arbitrary first-four-file sample | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-af1ab05709b6be71 | Final result distinguishes requested/planned/generated/implemented/tested/verified/committed/PR/deployed/production verified/externally blocked | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-0428517dc2a8f99f | Generic provider contracts, routing, timeouts, retries, reviewer separation, failover | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-cf7e9fcc607f36af | Line-ending test failures must be fixed, not dismissed | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-fdf61e1198d69b37 | Historical requirement C2A-001 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-7f32bfad0d9c77b5 | Historical requirement C2A-002 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-6472549fb276d011 | Historical requirement C2A-003 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-d0dda3d6a2bb2c59 | Historical requirement C2A-004 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-a7f6170e8826d638 | Historical requirement C2A-005 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-437fa3ac1ad3c3a4 | Historical requirement C2A-006 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-cb9f2b14a4087e27 | Historical requirement C2A-007 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-cebeb4bf88e07d98 | Historical requirement C2A-008 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-f3405169e08eb310 | Historical requirement C2A-009 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-14c2c65c21b29f2b | Historical requirement C2A-010 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-fb2ed8f4fb230e44 | Historical requirement C2A-011 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-2d81d9e0b976e74f | Historical requirement C2B-001 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-d226b77640583f47 | Historical requirement C2B-002 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-eb5d352c6c9de725 | Historical requirement C2B-003 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-f0706fa7ff432dc5 | Historical requirement C2B-004 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-5bc95bbfdbb6b145 | Historical requirement C2B-005 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-a453b8f7bd64f1db | Historical requirement C2B-006 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-70e273c4b949e986 | Historical requirement C2B-007 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-1b4cc2a6e9865f62 | Historical requirement C2B-008 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-0bede91e7b09ca49 | Historical requirement C2B-009 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-bb8aa938b3856864 | Historical requirement C2C-001 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-0802b645aa8f7454 | Historical requirement C2C-002 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-d172de608a4b0a13 | Historical requirement C2C-003 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-7e289f1d6201825d | Historical requirement C2C-004 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-c34e9c5b2a6e4e0b | Historical requirement C2C-005 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-86b2af497a797263 | Historical requirement C2C-006 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-0da071f652d107b1 | Historical requirement C2C-007 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-4115116ecedc20a7 | Historical requirement C2C-008 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-cd37476f2771cd51 | Historical requirement C2C-009 | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-b364a7c3a841229a | Historical requirement C2C-010 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-46988e896580b465 | Open-ended UniversalProductSpec persisted and versioned | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-6d2616e4fd8335f5 | ProductSurface is open-ended, not a closed enum | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-e53833e672c0a9ee | A product may declare multiple surfaces | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-a51961d8dabc7c7a | Persisted ArchitecturePlan covering components, languages, runtimes, build systems | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-d971209f585ef204 | Every architecture decision records reason, evidence, alternatives, tradeoffs, confidence | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-3d3520b407fd012f | No forced Next.js/React/Node/Postgres/Vercel unless requirements demand them | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-434c01be667b0636 | Repository tools bounded, path-safe, commit-scoped, evidence-recording | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-a4f981cbb4785a25 | Repository index with blob SHA, language, package ownership; HEAD invalidation | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-e56ca0418320d2fb | Multi-ecosystem manifest and lockfile discovery without a whitelist | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-7d66fa61a24e8a76 | RuntimeAdapter contract; no language-specific commands in the central pipeline | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-8a40f9e37e904a04 | Node/TypeScript adapter verified; repository scripts take precedence | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-0452da32b3571e6a | Python adapter verified across pyproject/requirements/Poetry/uv | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-ef66ec377e3d0a41 | Rust adapter verified including Cargo workspaces | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-281bb63d1c8c835e | Additional ecosystem adapters with honest capability states | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-84fa1e4265ce67ed | Generic unknown-runtime discovery producing a provisional RuntimeCapabilitySpec | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-5b88ad4d0de2df74 | Synthesised adapters are not trusted until validated | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-c748171487a28bc4 | FrameworkAdapter metadata; frameworks are adapters not categories | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-69382aa8da0b57c4 | Package manager and build system detection; install is not assumed to be npm | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-281c134dc47785e9 | Universal EngineeringTask graph reusing the Command 1 scheduler | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-2a8cc83a05c6e60d | Dynamic planning: tasks may be added, split, reordered with recorded evidence | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-46f5b83d6238545e | Product-specific acceptance criteria, never generic "app works" | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-8c423b0fd8e6305e | Validation derived from architecture and adapters; zero-test success is failure | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-71c02d0db99c70e1 | Generated code executes only through the Command 1 sandbox boundary | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-100a026ff4ce1209 | Versioned ModelCapabilityProfile with expiry and evidence-based claims | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-0b04639ded6a635c | Benchmark definitions and persisted results | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-f04bce1cee1fc182 | Capability-based routing with evidence-based failover | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-cdeb53fe22907342 | Provider-agnostic research with freshness metadata; retrieved pages untrusted | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-d195c28eedcb1f25 | Greenfield bootstrap without requiring a predefined template | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-c7b62da288a8e42e | Existing repositories inspected before modification and normally extended | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-e542cb2788e1dbed | Polyglot repositories assign adapters per component | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-2e7f021b34ad03ec | Monorepo workspace detection and focused validation | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-73d38e7e43a3b1ac | Security controls preserved in universal generation | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-cc5d209fc5c1116b | Transactional patching with repository and source-commit identity | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-b0705d92d29defeb | Evidence-based completion; a model message cannot complete a task | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-c93510957697e9ab | Test tier model showing exactly which tier was reached | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-d25a8bdd5fe1c4be | Black-box universality fixtures A-N | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-ecdae40ab2ae48bc | Polyglot fixture: three runtimes, correct adapters, no npm in Rust/Python | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-72dfee1e9681ccc9 | Monorepo fixture with deep nested target discovery | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-2ce983b9bc9e3af4 | Existing-repository fixture preserving unrelated functionality | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-4c1cec81cdc9ef2d | Unknown-runtime fixture proving discovery over whitelisting | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-eb9cb6375a0c0301 | Python FastAPI vertical slice through the real architecture | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-0b981ffb4df2dac8 | Feature-flagged rollout with shadow planning and rollback | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-6b1cb78649791802 | No unknown-product to static-HTML path in the universal execution path | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-9785d09800f7bf2e | Versioned persistence for specs, plans, adapters, runs and evidence | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-8a997cc762a23a84 | Required focused tests across every listed subsystem | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-5eff2238e0b038cb | Documentation distinguishing verified from planned and externally blocked | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-92d7e21a8b70f15c | Bounded targeted repair loop | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-4b75edc4932d5070 | Enabled universal execution path controls a real build | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-b9676b930b0fa4b6 | Generated projects really build and run in the sandbox | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-a724328fac781781 | Follow-up modification loads prior spec, plan and repository | IMPLEMENTED_BUT_UNVERIFIED | LATER_PENDING_HISTORICAL_EXPORT | EXTEND |
| XR-HIST-691e1e92942c062a | Historical requirement C3B-01 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-2914db9798b44912 | Historical requirement C3B-02 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-d4bb1e8b95a8dd3d | Historical requirement C3B-03 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-874f42a646a5b159 | Historical requirement C3B-04 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-e35aea71e8f54138 | Historical requirement C3B-05 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-a73f64588d77e341 | Historical requirement C3B-06 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-7afe888a87a7e502 | Historical requirement C3B-07 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-9ed9af821493cbf1 | Historical requirement C3B-08 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-5d3576e4146f63fb | Historical requirement C3B-09 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-9deda2e50701feae | Historical requirement C3B-10 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-0a45a0d5ca90a4dc | Historical requirement C3B-11 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-b4a461a9f14ac60f | Historical requirement C3B-12 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-e77dc5e636b3e6cb | Historical requirement C3B-13 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-c97da6498b184e52 | Historical requirement C3B-14 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-bd64ff9dfd7dfb13 | Historical requirement C3B-15 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-766f5dff72a30bbe | Historical requirement C3B-16 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-fe9595b329c787fd | Historical requirement C3B-17 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-0e91869832bd2c0f | Historical requirement C3B-18 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-e8f95e595d0d64cf | Historical requirement C3B-19 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-4a994a2ebfeb4b71 | Historical requirement C3B-20 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-940c7c451fcb26cd | Historical requirement C3B-21 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-e0987492e9580d36 | Historical requirement C3B-22 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-d5e4988cfe85ab03 | Historical requirement C3B-23 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-4159039c76021f5e | Historical requirement C3B-24 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-f7aadf4766f773d3 | Historical requirement C3B-25 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-7f611beb4336f2da | Historical requirement C3B-26 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-28d584fbc4e4acd5 | Historical requirement C3B-27 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-282d62de9ba62e73 | Historical requirement C3B-28 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-13bb06424902b003 | Historical requirement C3B-29 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-d15b1a949e551ee1 | Historical requirement C3B-30 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-5b5c9a3596f045af | Historical requirement C3B-31 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-0e2244b8e3444506 | Historical requirement C3B-32 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-126739b99d47dd95 | Historical requirement C3B-33 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-cebf131d43464ecf | Historical requirement C3B-34 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-e270e23a8cbe8041 | Historical requirement C3B-35 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-117a8122e816ddbe | Historical requirement C3B-36 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-5f403f96176670a9 | Historical requirement C3B-37 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-705c0fe07917770b | Historical requirement C3B-38 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-31a395ee3fed3280 | Historical requirement C3B-39 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-e53c670bbaf38d0f | Historical requirement C3B-40 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-4696dad6b0d25283 | Historical requirement C3B-41 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-fd1867a3aed79061 | Historical requirement C3B-42 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-bece02850ccd230a | Historical requirement C3B-43 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-3c00d3020255a238 | Historical requirement C3B-44 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-f711215ab1645b13 | Historical requirement C3B-45 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-44b033b4f5238d0a | Historical requirement C3B-46 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-eec9838dd1bc33cb | Historical requirement C3B-47 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-9f65ec44d15c8ba4 | Historical requirement C3B-48 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-d9ea10598b7fd5f3 | Historical requirement C3B-49 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-5c40f52d2fb92395 | Historical requirement C3B-50 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-1aad595d83eaa5f4 | Historical requirement C3B-51 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-71282ae75b6b91b3 | Historical requirement C3B-52 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-c1fe1fcad0d2cbd9 | Historical requirement C3B-53 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-110c779091059ecd | Historical requirement C3B-54 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-b656c3cad4bf009f | Historical requirement C3B-55 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-66d2e869b6b89d99 | Historical requirement C3B-56 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-a42ee0217b4b46ad | Historical requirement C3B-57 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-c8509683f9bf14a4 | Historical requirement C3B-58 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-bbd960e8cb5d7247 | Historical requirement C3B-59 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-0e3d44552ad0caa9 | Historical requirement C3B-60 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-f58283f7b2d62dfb | Historical requirement C3C-01 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-063230e949290b2a | Historical requirement C3C-02 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-efe7b6cb4af937b3 | Historical requirement C3C-03 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-3d2db5dd3a492dbc | Historical requirement C3C-04 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-ec01a4723282a7a0 | Historical requirement C3C-05 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-1d9c30b87fabf5f6 | Historical requirement C3C-06 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-0e3eebc897fd6a21 | Historical requirement C3C-07 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-dd09aea354be9691 | Historical requirement C3C-08 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-8cc2de3cad704110 | Historical requirement C3C-09 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-32b9665c1a26bc88 | Historical requirement C3C-10 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-9a45d488c072ecbf | Historical requirement C3C-11 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-f1ebfdd79d21ebb0 | Historical requirement C3C-12 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-dd3a9ad38c44e64b | Historical requirement C3C-13 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-fe51225f77f8e671 | Historical requirement C3C-14 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-bc51cf423b90dbba | Historical requirement C3C-15 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-0cfe839e52be32f1 | Historical requirement C3C-16 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-cbc981a37ef3f7bc | Historical requirement C3C-17 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-de01fa93ac79aabe | Historical requirement C3C-18 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-5e02fd52ef7b330c | Historical requirement C3C-19 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |
| XR-HIST-e16fdcdbe00f7154 | Historical requirement C3C-20 | PROPOSED_ONLY | LATER_PENDING_HISTORICAL_EXPORT | NEW |

## Deferred ownership and contradictions

`LATER_PENDING_HISTORICAL_EXPORT` is an explicit deferred ownership decision; it is not an invented mission number. Related capabilities and historical records remain separate when independent acceptance is not proven identical. A later export can merge semantic aliases while retaining stable source row mappings.

- CONTRADICTION-TOOLCHAIN-DOCS: AGENTS says Next.js 14; current manifest declares 15.5.21. Actual manifests/lockfiles govern; correct engineering documentation in Command 006.
- CONTRADICTION-HISTORICAL-COMPLETION: Historical complete/live labels and old task-graph claims are not current acceptance evidence. Preserve historical labels as source_reported_states; current runtime requirements remain unverified until tested.
- CONTRADICTION-MISSING-SOURCE-COVERAGE: Original 119-row/72-mission acceptance needs unavailable files. Record deferred historical coverage, validate all available source rows, proceed under explicit user amendment; never report original full coverage.

Reproduce with `node scripts/xroga/reconcile-requirements.mjs`; validate with `node scripts/xroga/validate-requirements-ledger.mjs`.
