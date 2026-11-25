// Request schemas of the protocol. Every request is plain JSON, so a later MCP bridge can forward calls unchanged and
// generate its tool definitions from these schemas.
import { z } from 'zod';

const ref = z.string().min(1).max(64).describe('A ref from the latest observation, such as "e12"');

export const RefTargetSchema = z.strictObject({ ref });
export const SemanticTargetSchema = z.strictObject({
  role: z.string().min(1).describe('Accessibility role, such as "button" or "link"'),
  name: z.string().optional().describe('Accessible name; matched exactly after whitespace is collapsed'),
  nth: z.number().int().min(0).optional().describe('Zero-based index among the matches, in document order'),
  within: z.string().min(1).max(120).optional().describe('Only inside this ref, or inside `dialog "Name"` (role and part of the name)'),
});
export const SelectorTargetSchema = z.strictObject({
  selector: z.string().min(1).describe('CSS selector (capability "selector")'),
});
export const PointTargetSchema = z.strictObject({
  x: z.number().describe('CSS pixels of the last screenshot (capability "vision")'),
  y: z.number(),
});
export const TargetSchema = z
  .union([RefTargetSchema, SemanticTargetSchema, SelectorTargetSchema, PointTargetSchema])
  .describe('The element to act on: a ref, or a role and name that must match exactly one element');

/** An element query for postconditions: a role, a name, or both. */
const CountQuerySchema = z
  .strictObject({
    role: z.string().min(1).optional().describe('The element role, such as listitem, row or button'),
    name: z.string().min(1).optional().describe('Text the element name contains'),
  })
  .refine(q => !!q.role || !!q.name, 'give a role, a name, or both');

export const ExpectationSchema = z
  .strictObject({
    url: z.string().optional().describe('The page URL contains this text'),
    text: z.string().optional().describe('This text is on the page'),
    textGone: z.string().optional().describe('This text is no longer on the page'),
    value: z.string().optional().describe("The target's value equals this"),
    checked: z.boolean().optional().describe('The target is checked (true) or unchecked (false)'),
    gone: z.boolean().optional().describe('The target is no longer in the page'),
    attribute: z.string().optional().describe('name=value'),
    enabled: z.boolean().optional().describe('Target enabled (true) or disabled'),
    exists: CountQuerySchema.optional().describe('An element with this role (and a name containing this text) is on the page'),
    count: CountQuerySchema.extend({
      equals: z.number().int().min(0).optional(),
      atLeast: z.number().int().min(0).optional(),
      atMost: z.number().int().min(0).optional(),
      delta: z.number().int().optional().describe('Change from before the action: 1 = gained a row'),
    })
      .refine(c => c.equals !== undefined || c.atLeast !== undefined || c.atMost !== undefined || c.delta !== undefined, 'count needs equals, atLeast, atMost or delta')
      .optional()
      .describe('How many elements with this role (and a name containing this text) the page has: the list gained a row'),
  })
  .describe('A postcondition checked after the action settles');

export const ObserveSchema = z.enum(['none', 'diff', 'full']).describe('Page state to return with the result');

const readCommon = {
  tabId: z.number().int().optional().describe("Default: the session's active tab"),
  intent: z
    .string()
    .max(500)
    .optional()
    .describe('Human-readable purpose, shown to the user and kept in the audit log'),
  // Positive: Puppeteer reads a navigation timeout of 0 as no deadline at all.
  timeoutMs: z.number().int().min(1).max(120_000).optional(),
};
const actionCommon = {
  ...readCommon,
  expect: ExpectationSchema.optional(),
  observe: ObserveSchema.optional(),
};

export const SnapshotArgsSchema = z.strictObject({
  ...readCommon,
  scope: z.string().min(1).max(120).optional().describe('Only the subtree of this ref or of `dialog "Name"`'),
  mode: z
    .enum(['interactive', 'all'])
    .optional()
    .describe('"interactive" prints only actionable elements and their containers'),
  window: z.enum(['viewport', 'near', 'page']).optional().describe('How much of the page to print'),
});

export const FindArgsSchema = z.strictObject({
  ...readCommon,
  role: z.string().optional(),
  name: z.string().optional().describe('Substring of the accessible name, case-insensitive'),
  text: z.string().optional().describe('Substring of the element’s name or value, case-insensitive'),
  xpath: z.string().min(1).max(400).optional().describe('XPath; returns refs of matching controls'),
  css: z.string().min(1).max(400).optional().describe('CSS selector; returns refs'),
  within: ref.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const ReadArgsSchema = z.strictObject({
  ...readCommon,
  ref: ref.optional().describe('Only the content of this element'),
  format: z.enum(['markdown', 'text', 'html', 'links', 'article', 'data']).default('markdown').describe('html: markup; links: every link; article: main text only; data: JSON-LD, meta, contacts, socials'),
  maxChars: z.number().int().min(100).max(200_000).optional(),
  offset: z.number().int().min(0).optional().describe('Character offset to continue from'),
  match: z.string().max(200).optional().describe('Only the lines matching this word or pattern, with context'),
  context: z.number().int().min(0).max(10).optional(),
  styles: z.boolean().optional().describe('With ref: its computed styles and what covers it'),
});

export const ScreenshotArgsSchema = z.strictObject({
  ...readCommon,
  ref: ref.optional().describe('Only this element'),
  fullPage: z.boolean().optional(),
  ifChanged: z.boolean().optional().describe('Return no image when the picture is the same as the last one of this tab'),
  labels: z.boolean().optional().describe('Draw ref labels over actionable elements'),
  grid: z.boolean().optional().describe('Draw a 0 to 1 coordinate grid, for placing pointer actions on a painted canvas'),
  mark: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional().describe('[x, y] fractions: draw a red crosshair where a pointer action landed'),
  marks: z.boolean().optional().describe('Number the labels, icons and controls the picture shows (set of marks): act on one with canvas mark N, no coordinates to estimate'),
  region: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]).optional()
    .describe('[x0, y0, x1, y1] fractions of the page: capture only this area, enlarged, with a fine grid (for small painted controls)'),
});

export const ClickArgsSchema = z.strictObject({
  ...actionCommon,
  target: TargetSchema,
  button: z.enum(['left', 'right', 'middle']).optional(),
  count: z.number().int().min(1).max(3).optional(),
  holdMs: z.number().int().min(50).max(10000).optional().describe('press and hold this long (ms)'),
  modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional(),
  at: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
});

export const SetArgsSchema = z.strictObject({
  ...actionCommon,
  target: TargetSchema,
  value: z.union([z.string(), z.boolean(), z.array(z.string())]),
  submit: z.boolean().optional().describe('Press Enter after setting the value'),
});

export const FillFormArgsSchema = z.strictObject({
  ...actionCommon,
  fields: z
    .array(
      z.strictObject({
        target: TargetSchema,
        value: z.union([z.string(), z.boolean(), z.array(z.string())]),
        pick: z
          .union([z.string(), z.literal(true)])
          .optional()
          .describe('Typeahead: then click this suggestion (true: named like the value)'),
      }),
    )
    .min(1),
  submit: TargetSchema.optional().describe('Activate this element after every field is set'),
});

export const TypeArgsSchema = z.strictObject({
  ...actionCommon,
  text: z.string(),
  target: TargetSchema.optional(),
  submit: z.boolean().optional(),
});

export const PressArgsSchema = z.strictObject({
  ...actionCommon,
  keys: z.string().min(1).describe('A key or chord: "Enter", "Escape", "Control+A"; Mod is Control, or Command on a Mac'),
  target: TargetSchema.optional(),
});

export const HoverArgsSchema = z.strictObject({ ...actionCommon, target: TargetSchema });

export const DragArgsSchema = z.strictObject({
  ...actionCommon,
  from: TargetSchema.describe('The element to pick up'),
  to: TargetSchema.describe('The element to drop it on'),
  // A point inside each element, as fractions of its box: how to draw or move inside a canvas.
  fromAt: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  toAt: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
});

const placeOnPage = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export const CanvasArgsSchema = z.strictObject({
  ...actionCommon,
  action: z.enum(['click', 'double_click', 'right_click', 'hover', 'drag', 'type', 'key']),
  at: placeOnPage.optional().describe('[x, y] fractions of the screenshot'),
  to: placeOnPage.optional().describe('drag end'),
  mark: z.number().int().min(1).max(200).optional().describe('instead of at: the number of a mark in the last screenshot taken with marks true'),
  toMark: z.number().int().min(1).max(200).optional().describe('drag end as a mark number'),
  label: z.string().min(1).max(80).optional().describe('instead of at: a text the canvas painted, exactly as a screenshot lists it (the label of a menu, a tool, a button)'),
  text: z.string().max(4000).optional().describe('type: text for a field the canvas paints'),
  key: z.string().max(40).optional().describe('key: Enter, Tab, Escape, Backspace, Control+A, F6'),
  replace: z.boolean().optional().describe('type: select all first'),
  intent: z.string().min(3).max(120).describe('what this does'),
});

export const ScrollArgsSchema = z.strictObject({
  ...actionCommon,
  target: TargetSchema.optional().describe('The container to scroll; default: the page'),
  to: z.union([z.enum(['top', 'bottom']), TargetSchema]).optional(),
  by: z.strictObject({ pages: z.number().optional(), px: z.number().optional() }).optional(),
  untilEnd: z.boolean().optional().describe('with to bottom: repeat while the page loads more'),
  maxRounds: z.number().int().min(1).max(100).optional().describe('untilEnd: round limit, default 30'),
});

export const WaitArgsSchema = z.strictObject({
  ...readCommon,
  observe: ObserveSchema.optional(),
  text: z.string().optional(),
  textGone: z.string().optional(),
  networkIdle: z.boolean().optional().describe('The page has finished loading and nothing arrived for half a second'),
  target: TargetSchema.optional(),
  state: z.enum(['visible', 'hidden', 'attached', 'detached', 'enabled']).optional(),
  reading: z
    .strictObject({
      equals: z.string().optional(),
      contains: z.string().optional(),
      matches: z.string().optional(),
      above: z.number().optional(),
      below: z.number().optional(),
      changed: z.boolean().optional(),
    })
    .optional()
    .describe('Wait until the target reads this (value or text; matches is a regex)'),
  url: z.string().optional(),
  ms: z.number().int().min(0).max(60_000).optional(),
});

export const DemoArgsSchema = z.strictObject({
  action: z.enum(['start', 'stop']),
});

export const ExtractRowsArgsSchema = z.strictObject({
  ...readCommon,
  scope: z.string().max(120).optional().describe('Only the region, table or section with this name; default: the whole page'),
  table: z.number().int().min(1).optional().describe('Only the Nth table found'),
  maxRows: z.number().int().min(1).max(50_000).optional(),
  cards: z.string().max(200).optional().describe('CSS selector of repeated cards'),
  fields: z.record(z.string().max(60), z.string().max(200)).optional().describe('column to selector in a card; sel@attr reads an attribute'),
});

export const WebSearchArgsSchema = z.strictObject({
  ...readCommon,
  query: z.string().trim().min(2).max(300).describe('Words to search for'),
  engine: z.enum(['duckduckgo', 'bing', 'google']).optional().describe('Default duckduckgo; try another if one asks for a human check'),
  limit: z.number().int().min(1).max(30).optional().describe('Results to return, default 10'),
});

export const FormModelArgsSchema = z.strictObject({
  ...readCommon,
  scope: z.string().max(120).optional().describe('Only the form, dialog or group with this name (a substring of its accessible name or legend); default: the whole page'),
});

export const EmulateArgsSchema = z.strictObject({
  ...readCommon,
  device: z.enum(['iphone-15', 'pixel-8', 'ipad', 'laptop', 'desktop']).optional(),
  width: z.number().int().min(100).max(10000).optional(),
  height: z.number().int().min(100).max(10000).optional(),
  scale: z.number().min(0.5).max(5).optional(),
  mobile: z.boolean().optional(),
  colorScheme: z.enum(['light', 'dark']).optional(),
  reducedMotion: z.boolean().optional(),
  media: z.enum(['print', 'screen']).optional(),
  network: z.enum(['offline', 'slow-3g', 'fast-3g', 'none']).optional(),
  cpuSlowdown: z.number().min(1).max(20).optional(),
  timezone: z.string().max(60).optional().describe('IANA name, e.g. Asia/Tokyo'),
  locale: z.string().max(20).optional().describe('e.g. de-DE'),
  reset: z.boolean().optional(),
});

export const AuditPageArgsSchema = z.strictObject({
  ...readCommon,
  url: z.string().url().max(2000).optional().describe('Audit this address in a background tab instead of the open page'),
});

export const DiagnosticsArgsSchema = z.strictObject({
  ...readCommon,
  kind: z.enum(['both', 'console', 'network', 'endpoints', 'cookies', 'storage', 'issues', 'weight', 'request', 'fetch']).optional().describe('fetch: GET urlPattern with the signed-in session, secrets hidden; request: newest request whose address contains urlPattern, with headers and body; endpoints: API calls; cookies, storage: names and sizes; issues: browser problems; weight: biggest, slowest requests'),
  onlyProblems: z.boolean().optional().describe('Errors, and requests that failed or got 400+'),
  urlPattern: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const NavigateArgsSchema = z.strictObject({
  ...actionCommon,
  url: z.string().optional(),
  action: z.enum(['back', 'forward', 'reload']).optional(),
});

export const TabsArgsSchema = z.strictObject({
  intent: readCommon.intent,
  action: z.enum(['list', 'open', 'select', 'close', 'adopt']),
  url: z.string().optional(),
  tabId: z.number().int().optional(),
});

export const HandleDialogArgsSchema = z.strictObject({
  ...actionCommon,
  accept: z.boolean(),
  promptText: z.string().optional(),
});

/**
 * `upload` (files capability): files into a file input, from local paths (`DOM.setFileInputFiles`) or as bytes
 * (base64), which the probe turns into `File` objects. Exactly one source. Without a target, the input of the pending
 * file chooser.
 */
export const UploadArgsSchema = z.strictObject({
  ...actionCommon,
  target: TargetSchema.optional().describe('The file input; leave out to fill the pending file chooser'),
  paths: z.array(z.string().min(1)).min(1).max(20).optional(),
  attachments: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(255),
        mimeType: z.string().max(255),
        base64: z.string(),
      }),
    )
    .min(1)
    .max(20)
    .optional(),
});

export const AskUserArgsSchema = z.strictObject({
  tabId: readCommon.tabId,
  message: z.string().min(1).max(2000),
  kind: z.enum(['takeover', 'input']),
  timeoutMs: z.number().int().min(1000).max(900_000).optional(),
});

export type Target = z.infer<typeof TargetSchema>;
export type RefTarget = z.infer<typeof RefTargetSchema>;
export type SemanticTarget = z.infer<typeof SemanticTargetSchema>;
export type Expectation = z.infer<typeof ExpectationSchema>;
export type Observe = z.infer<typeof ObserveSchema>;
export type SnapshotArgs = z.infer<typeof SnapshotArgsSchema>;
export type FindArgs = z.infer<typeof FindArgsSchema>;
export type ReadArgs = z.infer<typeof ReadArgsSchema>;
export type ScreenshotArgs = z.infer<typeof ScreenshotArgsSchema>;
export type ClickArgs = z.infer<typeof ClickArgsSchema>;
export type SetArgs = z.infer<typeof SetArgsSchema>;
export type FillFormArgs = z.infer<typeof FillFormArgsSchema>;
export type TypeArgs = z.infer<typeof TypeArgsSchema>;
export type PressArgs = z.infer<typeof PressArgsSchema>;
export type HoverArgs = z.infer<typeof HoverArgsSchema>;
export type DragArgs = z.infer<typeof DragArgsSchema>;
export type CanvasArgs = z.infer<typeof CanvasArgsSchema>;
export type ScrollArgs = z.infer<typeof ScrollArgsSchema>;
export type WaitArgs = z.infer<typeof WaitArgsSchema>;
export type NavigateArgs = z.infer<typeof NavigateArgsSchema>;
export type DiagnosticsArgs = z.infer<typeof DiagnosticsArgsSchema>;
export type FormModelArgs = z.infer<typeof FormModelArgsSchema>;
export type AuditPageArgs = z.infer<typeof AuditPageArgsSchema>;
export type EmulateArgs = z.infer<typeof EmulateArgsSchema>;
export type WebSearchArgs = z.infer<typeof WebSearchArgsSchema>;
export type ExtractRowsArgs = z.infer<typeof ExtractRowsArgsSchema>;
export type DemoArgs = z.infer<typeof DemoArgsSchema>;
export type TabsArgs = z.infer<typeof TabsArgsSchema>;
export type HandleDialogArgs = z.infer<typeof HandleDialogArgsSchema>;
export type UploadArgs = z.infer<typeof UploadArgsSchema>;
export type AskUserArgs = z.infer<typeof AskUserArgsSchema>;

export function isRefTarget(target: Target): target is RefTarget {
  return 'ref' in target;
}

export function isSemanticTarget(target: Target): target is SemanticTarget {
  return 'role' in target;
}
