# Command 1 route map

| Route | Audience | Availability | Data source / behavior |
| --- | --- | --- | --- |
| `/os-preview` | Guest and signed-in | Interactive product overview | Static copy, links to real current workspace and demo. No API. |
| `/os-preview/journey` | Guest and signed-in | Interactive preview | Deterministic client fixture adapter only. No Xroga API or model calls. |
| `/os-preview/{workspace,projects,settings}` | Guest and signed-in | Available-now guide | Links to existing product destinations; their existing auth remains authoritative. |
| `/os-preview/coding` | Guest and signed-in | Interactive preview guide | Links to code-repair fixture. |
| `/os-preview/{browser,automations,employees,work-packs,genome,artifacts,drive,insights}` | Guest and signed-in | Coming soon | Explanatory page and disabled action, no backend call. |
| `/os-preview/founder` | Server-authorized target only | Founder shell; backend diagnostics pending | Middleware protected prefix and server `getUser` + verified target email + profile owner role via RPC + AAL2. Dynamic, no-store, noindex. |
| `/os-preview/access-denied` | Anyone | Neutral denial page | No account or diagnostic detail. |

No existing route was repurposed. `/workspace`, `/dashboard`, `/admin`, `/preview`, `/terminal`, auth and billing retain their existing components and transports. The preview namespace is excluded from marketing chrome but is not an auth-required route except for its founder path.
