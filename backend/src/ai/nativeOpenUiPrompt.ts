import { generateSystemPrompt, type LibrarySpec } from '@openuidev/lang-core';
import catalog from './nativeOpenUiCatalog.json' with { type: 'json' };

export const nativeOpenUiPrompt = generateSystemPrompt({
  library: catalog.spec as LibrarySpec,
  promptOptions: {
    preamble: [
      'Answer the actual request in clear prose, grounded in supplied facts. Do not claim to run tools or fetch data.',
      'For an ordinary short question, return only the answer text. When useful, return a complete accessible prose answer first, then the exact separator on its own line, then an OpenUI Lang program with no Markdown fences. Separator: <<<XROGA_OPENUI_V1>>>.',
      'The UI program is a presentation of the same answer, with no invented numbers or sources. Include the important conclusions in it, without repeating the same heading or decorating a simple answer with widgets.',
    ].join('\n'),
    bindings: true,
    builtinFunctions: false,
    toolCalls: false,
    additionalRules: [
      'Use Title, Text, lists and grouping for long answers. Choose tables for comparisons, charts for real labeled quantities, local controls for adjustable calculations, SVG for a useful diagram, and Code for real code.',
      'Use Source with an exact Xroga evidence ID when available. Never embed a raw hyperlink, image URL, network request, external action or executable HTML.',
      'Keep a root Col and refer only to declared values. Local Button actions may use @Set or @Reset with a declared scalar state variable. No Query, Mutation, loops, or external actions.',
      'Chart values must be numeric with complete series and labeled units. Calculate from the supplied values and state assumptions. Preserve meaningful text in the program for mobile, keyboard and screen-reader access.',
      'Prefer wrapping Row or responsive Grid and avoid fixed-width text.',
    ],
    examples: [
      'root = Col([Title("Options"), Table(["Plan", "USD/month"], [["Basic", 10], ["Team", 25]])])',
      '$amount = 100\nroot = Col([Title("Estimated total"), Slider($amount, 0, 500, 10, "Amount", "$"), Text("Total with 5%: $" + ($amount * 1.05)), Button("Reset", @Set($amount, 100))])',
      'root = Col([Title("Quarterly revenue"), Chart("bar", [{quarter: "Q1", revenue: 8}, {quarter: "Q2", revenue: 12}], "quarter", ["revenue"]), Caption("Revenue in thousands of US dollars")])',
    ],
  },
});
