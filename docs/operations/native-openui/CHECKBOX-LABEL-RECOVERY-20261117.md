# Captured live checklist recovery

The private authenticated Workspace run at `151d51035b3c26e16eb25baafc9043a316acd294` generated two fresh DeepSeek answers. The deliveries chart passed independent review. The checklist failed visual review because checkbox labels exposed Markdown delimiters, despite working controls and successful persistence. Automated passing checks were not treated as sufficient acceptance.

## Focused correction

Checkbox labels reuse the existing safe inline Markdown renderer. Bold and code spans retain their meaning, raw HTML remains escaped, and the existing local state binding is unchanged. Multiline checkboxes align with their first text line. No component registry, model, orchestration, accounting, storage format or backend behavior changed.

The browser regression checks keyboard and label-click toggling, accessible names, formatted text, escaped HTML and first-line alignment. The complete captured 18-item answer is replayed independently at 320, 390, 768, 1280 and 1440 pixels in both themes. Its source text, native program and local-only limitation remain intact. Captured replay makes zero provider calls.

## Actual live accounting

| Case | Classifier request | Primary answer request | Settled cost | Answer latency |
| --- | --- | --- | --- | --- |
| Deliveries plot | `req_6u9kWwiDaX3346HFDmBfC5TB` | `req_EnnN4d1UmKf6o3lTXx3bS9Ei` | $0.000353 | 14,828 ms |
| Local blog checklist | `req_ujTbG1n0uJUn9pYO5OUQfpg3` | `req_SHP7LmEDKNxpteU6mGqaex48` | $0.000979 | 49,584 ms |

All four dispatches settled through the canonical ledger, total $0.001332. No Search or model retry occurred. The existing build was reused. This continuation's additional measured runtime estimate is $0.006311544069807162, with no repeated build charge. These infrastructure figures are estimates, not invoices.

Independent cleanup at 2026-11-16 19:55:10 UTC verified zero temporary runtime or artifact resources. Test KMS destruction is scheduled. Production was unchanged.

## Evidence and limits

Privacy-safe detailed evidence is retained under the operator's `workspace-universal-acceptance/candidate-151d51035-utf8-continuation` directory: actual answers, canonical receipts, independent review records, screenshots, persistence checks, authentication denials and cleanup readback. The failed live screenshot is preserved separately from the corrected replay.

The 151d51035 source had all eleven CI workflows passing. The correction requires its own exact-source CI and release checks. Local captured replay is not a new hosted deployment, production promotion or proof that every possible prompt succeeds. Final production approval remains separate.
