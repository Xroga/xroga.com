# Command 3 route and action matrix

All `/os-preview` routes are noindex. “Interactive preview” means browser-local simulation, not a backend feature. Public checks are `frontend/e2e/os-preview.spec.ts`, `os-command2.spec.ts`, and `os-command3.spec.ts`; full coverage of every control is not claimed.

| Route | Persona / state | Primary visible controls | Current test status |
| --- | --- | --- | --- |
| `/os-preview` | Public · overview | Journey and section links; live workspace link | Implemented & tested: guest entry, nav |
| `/os-preview/journey` | Public · interactive preview | Scenario, goal/constraints/deliverable draft, approval acknowledgement, ending, run/pause/step/replay/reset, evidence/receipt | Implemented & tested: clinic/alternate paths; draft reload and fixture-evidence gate in Command 3 |
| `/os-preview/overview` | Public · interactive preview | Project selection, cross-links | Implemented & partly tested |
| `/os-preview/workspace` | Public · interactive preview | Project, budget, local stage and related-screen links | Implemented & tested: shared draft/project |
| `/os-preview/projects` | Public · interactive preview | Project cards and open link | Implemented & partly tested |
| `/os-preview/activity` | Public · interactive preview | Project cards and related-screen links | Partly implemented: no rich event feed |
| `/os-preview/coding` | Public · interactive preview | Fixture, file search/tree, before/after, accept/reject, deterministic example test | Implemented & tested: repair happy/failed paths; no actual test/PR |
| `/os-preview/browser` | Public · interactive preview | Strategy, local approval, step/pause/retry | Partly implemented: timeout example; selector fallback and verified recovery not yet complete |
| `/os-preview/research` | Public · interactive preview | Search/select/save/reopen fictional finding | Implemented & partly tested; no real sources |
| `/os-preview/artifacts` | Public · interactive preview | Project/folder list, filter, preview, page-local duplicate | Partly implemented: no persistent version browser |
| `/os-preview/drive` | Public · Coming soon | Explanatory page and working link to example workspace | Implemented & tested as Coming soon; no quota or upload |
| `/os-preview/automations` | Public · interactive preview | Accessible add/connect/edit/reorder/delete, validate, dry run, save | Implemented & tested core; pause/version semantics partial |
| `/os-preview/employees` | Public · interactive preview | Search/select role, permission/cost detail, project link | Implemented & tested selection; no worker |
| `/os-preview/work-packs` | Public · interactive preview | Search/select pack, project link | Implemented & partly tested; no install |
| `/os-preview/genome` | Public · interactive preview | Search/category, select asset, inspect license/compatibility, approach | Implemented & tested rejection; no import/compose engine |
| `/os-preview/experience` | Public · interactive preview | Safe/cross-customer fixture, approve/reject candidate | Implemented & tested privacy rejection; certification partial |
| `/os-preview/skills` | Public · interactive preview | Search and inspect capability | Partly implemented; no connection configuration |
| `/os-preview/rich-results` | Public · interactive preview | Existing sample gallery controls | Existing Command 1.5 tested separately; real chat renderer unchanged |
| `/os-preview/bench` | Public · interactive preview | Strategy inspect, shared budget | Partly implemented; no sample-size table or promotion |
| `/os-preview/models` | Public · interactive preview | Strategy inspect, shared budget | Partly implemented; no live provider data |
| `/os-preview/insights` | Public · interactive preview | Shared budget and strategy explanation | Partly implemented; no live cost or storage ledger |
| `/os-preview/settings` | Public · interactive preview | Reset local Command 2 demo; current workspace link | Implemented & tested reset; not real account settings |
| `/os-preview/help` | Public · interactive preview | Availability guide; current workspace link | Implemented & route-tested |
| `/os-preview/founder` | Server-checked founder only; real diagnostics **blocked** | Frontier fictional report selector/decision, Scenario Lab selectors/replay/step/reset/fixed finding, disconnected Operations filters | Negative auth unit/guest tests; founder UI E2E **blocked** without verified AAL2 owner test account |
| `/os-preview/access-denied` | Public neutral denial | Return to preview | Implemented & route-checked |

The existing production `/workspace`, `/terminal`, `/dashboard`, `/admin`, auth, account and billing routes are outside this matrix and were not rewritten. Direct backend admin APIs are **not** connected to the founder shell.
