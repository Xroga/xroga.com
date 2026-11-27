# Workspace answer presentation, 28 November 2026

Observed on the live signed-in Workspace before this change (short question, 600-word explanation, chart request,
calculator, web research, Urdu plan; desktop dark theme and one phone-width check).

| Defect seen | Root cause | Change |
| --- | --- | --- |
| The same monthly figures appeared four times. A research table appeared twice. | The answer instructions demanded a complete written backup of every visual, and the screen also drew the saved plain-text copy under the visual. | Instructions give each figure one home. The screen draws the bound answer and the visuals; the saved copy stays for Copy, Share and recovery. |
| Long, dense answers with unrequested caveats, formulas and method notes. | No length guidance by request type; several rules asked for more. | One concision rule by request type, overridden by an explicit request for length. No output token limit changed. |
| Numbered steps and bullets had no markers. | The page style reset removed them in the native answer. | Markers restored. |
| Two fonts and two text widths in one conversation. | Native answers used the system font and a narrower paragraph measure. | One font, width and rhythm. |
| A correct calculator showed "The calculated results replace an inconsistent numerical explanation." | $664.2862 beside a $664.29 readout counted as a conflict. | A figure that rounds to the readout agrees. |
| Calculator fields stacked in one tall column; a chart always carried a second data table. | One control column by default; the table was always open. | Number fields share a row; chart figures open with "View data". |
| The page moved while an answer was written and when it finished. | Content height shrank when progress folded away or the renderer changed; a calculator was inserted above text already being read. | The newest exchange keeps a screen of room under its prompt; visuals follow the introduction; the loading view shows only what stays. |
| Urdu was cramped and right-to-left tables aligned left. | Latin line height and left alignment. | Script-based line height and font fallbacks; start alignment. |

Not verified: real model answers under the new instructions (needs a deployment), the turn spacer in the signed-in
Workspace, a physical phone, and the light theme. Plans and model-written notes are handled by the parent change.
