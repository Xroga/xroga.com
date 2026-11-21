# Open Intelligent UI source

The chart, table and range control use the [MIT-licensed Open Intelligent UI source](https://github.com/thesysdev/open-intelligent-ui/tree/9df2e64bc44282f6305a47eb6dbbbd8f28139138/src/lib/components). See [LICENSE](LICENSE).

- `chart.tsx` keeps the upstream SVG plots and legends. Xroga checks coordinates before calling the renderer and preserves tooltip precision.
- `table.tsx` adapts the upstream responsive frame and numeric alignment. Xroga's existing safe Markdown, entity and status cells retain exact data. Sorting is keyboard-accessible.
- `slider.tsx` adapts the range control from `controls.tsx`. The existing Xroga calculator still owns inputs, formula validation, scenario restoration and reset.
- `../intelligent-ui.module.css` scopes upstream styles to the response block and uses Workspace theme variables.

The OpenUI Lang renderer uses pinned `@openuidev/react-lang@1.1.0`. The integration accepts only application-built programs from validated Xroga response blocks. It registers no remote tool, mutation or action handlers. OpenUI observability and the automatic development inspector are disabled on this surface.
