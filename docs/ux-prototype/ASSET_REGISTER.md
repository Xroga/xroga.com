# Open-source asset register — source snapshot 2026-10-10

Repository metadata and commit IDs were checked against GitHub's repository and HEAD APIs. Licenses are the source repository license at the recorded commit (for `ai-elements`, its LICENSE text says Apache-2.0 although GitHub's classifier returned NOASSERTION). These are references, **not copied code**. Command 1 adds **zero** new UI dependencies and retains the installed Lucide, Motion, Recharts, TanStack and toast packages. No external source license notice is needed in a shipped bundle because no listed repository code was copied.

| Repository | License | Source commit | Evaluation / integration decision | Dependency impact |
| --- | --- | --- | --- | --- |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | MIT | `2d3f1cd436b18ea12f24130de4df781355925b08` | Accessible compositional patterns; no init or component copy to avoid theme reset. | None in Command 1. |
| [radix-ui/primitives](https://github.com/radix-ui/primitives) | MIT | `01259a024d82ab3892d1e5938b1a50bb352c6df5` | Dialog and tab semantics reference; current preview uses native semantic controls. | None. |
| [adobe/react-spectrum](https://github.com/adobe/react-spectrum) | Apache-2.0 | `740c6c5c4a717ca8c82fc4d15d199f6166cd42dc` | Accessibility interaction reference; a full adoption would be excessive. | None. |
| [magicuidesign/magicui](https://github.com/magicuidesign/magicui) | MIT | `cdb348cb4c72a9b54b554d8617801e479fbc8714` | Motion reference; Command 1 uses restrained CSS transitions and reduced-motion CSS. | None. |
| [tremorlabs/tremor](https://github.com/tremorlabs/tremor) | Apache-2.0 | `ca4d588f47820ff3d514d37fa4ee08a4222dec11` | Analytics density reference; no dashboard stack added. | None. |
| [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT | `a6d22742b68955b9979c3adae1da486053e8eb5f` | Composer and message UX reference only; Xroga SSE and chat context remain canonical. | None. |
| [vercel/ai-elements](https://github.com/vercel/ai-elements) | Apache-2.0 (`LICENSE`; GitHub classifier NOASSERTION) | `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd` | Step/result composition reference; no runtime imports. | None. |
| [emilkowalski/sonner](https://github.com/emilkowalski/sonner) | MIT | `8e4662b39255120b62138312058f5d77c0139a5e` | Toast UX reference; existing `react-hot-toast` stays. | None. |
| [xyflow/xyflow](https://github.com/xyflow/xyflow) | MIT | `3d35b57317576b0916c0bfeaaedd573aaacc2839` | Command 2 candidate for dependency editor, not needed for Command 1 list. | Deferred; graph bundle cost to evaluate. |
| [suren-atoyan/monaco-react](https://github.com/suren-atoyan/monaco-react) | MIT | `f7ef2e686c83449babaea49815c69db3668d2ab7` | Command 2 code editor candidate. | Deferred; Monaco worker/bundle cost. |
| [uiwjs/react-codemirror](https://github.com/uiwjs/react-codemirror) | MIT | `02e6b5a53d677d60764c5a6a10a84d7fb5a611fd` | Alternative Command 2 editor; choose one editor later. | Deferred; do not install alongside Monaco. |
| [TanStack/table](https://github.com/TanStack/table) | MIT | `d8ae30bcfe8665ef43d7557f4a492e0caa6f9c40` | Existing frontend data table dependency, possible future diagnostics. | Already installed `@tanstack/react-table` ^8.21.3; no new install. |
| [TanStack/virtual](https://github.com/TanStack/virtual) | MIT | `259fc1aefa0653e22cb01c2050011ee785124c6d` | Existing frontend virtual-list dependency, possible future event scale. | Already installed `@tanstack/react-virtual` ^3.14.13; no new install. |
| [bvaughn/react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | MIT | `f4c06add8848836e65cbbd20a02f8de0d6be4618` | Command 2 workbench candidate. | Deferred; first check API/version and mobile behavior. |
| [microsoft/playwright](https://github.com/microsoft/playwright) | Apache-2.0 | `d9f2fd3e2232ace8e317a84eda6cb86e25bcf49c` | Browser verification for demo, guest founder route and breakpoints. | Root `@playwright/test` 1.62.0 already present. |
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | MPL-2.0 | `44f5b6c5ef14bb02659bf3a47f6ef04d83dd2faa` | Later automated accessibility audit candidate. | Deferred; license obligations and test integration to review. |

Next.js 16/Tailwind 4 dashboard templates are design references only, not adopted. Their dependency stacks would conflict with the current Next.js 15/Tailwind 3 application. No repository was cloned or globally initialized.
