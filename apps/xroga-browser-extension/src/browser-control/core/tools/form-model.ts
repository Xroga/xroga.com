// `form_model`: every visible field of the page (or of one named form, dialog or group) in a single read, so a long form is filled with one fill_form call
// instead of one inspection per field: role, name, current value, whether it is required, the choices of a select or list, and the validation message it shows.
// Read-only; passwords, card numbers, one-time codes and file fields are listed as (hidden). Covers every frame of the tab.
import type { FormField } from '../../probe/source';
import type { FormModelArgs } from '../../protocol/schemas';
import type { ToolContext, ToolOutcome } from '../controller';
import { withPageState } from './navigate';

/** One line a model can act on: `1. textbox "Email" *required = "ana@x.test"`, `2. combobox "Country" options [UK | US]`. */
export function fieldLine(f: FormField, i: number): string {
  const bits = [`${i}. ${f.role} ${JSON.stringify(f.name || '(no name)')}`];
  if (f.type) bits.push(`(${f.type})`);
  if (f.required) bits.push('*required');
  if (f.disabled) bits.push('disabled');
  if (f.checked !== undefined) bits.push(f.checked ? 'checked' : 'unchecked');
  else if (f.value !== undefined) bits.push(f.value === '' ? 'empty' : `= ${JSON.stringify(f.value)}`);
  if (f.options?.length) bits.push(`options [${f.options.join(' | ')}]`);
  if (f.error) bits.push(`ERROR ${JSON.stringify(f.error)}`);
  return (f.group ? `[${f.group}] ` : '') + bits.join(' ');
}

export async function formModel(ctx: ToolContext, args: FormModelArgs): Promise<ToolOutcome> {
  const attachment = await ctx.attach();
  const tab = ctx.tab();
  const frames = await attachment.topology.frames();
  const fields: FormField[] = [];
  for (const frame of frames) {
    const part = await tab.probe!.callGlobal<FormField[]>(frame, 'formModel', args.scope).catch(() => [] as FormField[]);
    fields.push(...(part ?? []));
  }
  const empty = fields.filter(f => f.value === '' && f.checked === undefined).length;
  const missing = fields.filter(f => f.required && !f.disabled && (f.checked === false || f.value === '')).length;
  const lines = fields.length
    ? [`form_model · ${fields.length} fields${args.scope ? ` in "${args.scope}"` : ''}, ${empty} empty, ${missing} required still empty`, ...fields.map((f, i) => fieldLine(f, i + 1))]
    : [`form_model · no fields${args.scope ? ` in a form, dialog or group named "${args.scope}"` : ''}`];
  return withPageState(ctx, 'none', { data: { fields }, lines });
}
