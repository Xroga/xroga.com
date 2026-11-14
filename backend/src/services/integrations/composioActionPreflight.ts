// Provider schemas are untrusted metadata. Check the common input constraints
// without compiling provider code, running provider regexes or resolving URLs.
type Schema = Record<string, unknown>;
const SHEETS_APPEND = 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND';
const safeName = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const record = (v: unknown): v is Schema => v !== null && typeof v === 'object' && !Array.isArray(v);
const blank = (v: unknown) => v === undefined || (typeof v === 'string' && !v.trim());
const scalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object': return record(value);
    case 'array': return Array.isArray(value);
    case 'null': return value === null;
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
    case 'string': return typeof value === type;
    default: return true;
  }
}

export function composioActionInputProblem(
  toolSlug: string, args: Schema, schema: Schema | undefined, request: string,
): string | null {
  if (toolSlug === SHEETS_APPEND) {
    if (typeof args.spreadsheetId !== 'string' || blank(args.spreadsheetId) ||
        typeof args.range !== 'string' || blank(args.range)) {
      return 'Which spreadsheet and tab or range should I use? Share the spreadsheet link and a target such as Sheet1!A1:B3. No changes were made.';
    }
    if (/\b(?:creat(?:e|ing)|mak(?:e|ing)|add(?:ing)?)\s+(?:(?:a|new|one|two|three|four|five|multiple|separate|distinct|\d+)\s+){0,4}tables?\b/i.test(request)) {
      return 'Appending rows does not create tables. Do you want separate tables, or should I add rows to the selected sheet? No changes were made.';
    }
  }

  let remaining = 4_000;
  let tooComplex = false;
  function check(value: unknown, rule: unknown, path: string, depth: number): string[] {
    if (depth > 20 || --remaining < 0) {
      tooComplex = true;
      return [];
    }
    if (rule === false) return [path];
    if (!record(rule)) return [];
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (types.length && types.every((type) => typeof type === 'string' && !matchesType(value, type))) return [path];
    if (Array.isArray(rule.enum) && rule.enum.every(scalar) && !rule.enum.includes(value)) return [path];
    if (Object.hasOwn(rule, 'const') && scalar(rule.const) && rule.const !== value) return [path];
    if (typeof value === 'string' && typeof rule.minLength === 'number' && [...value].length < rule.minLength) return [path];

    const issues: string[] = [];
    for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
      const group = rule[key];
      if (!Array.isArray(group)) continue;
      if (group.length > 32) { tooComplex = true; return []; }
      const results = group.map((item) => check(value, item, path, depth + 1));
      if (key === 'allOf') {
        for (const result of results) issues.push(...result);
      } else {
        const matches = results.filter((result) => !result.length).length;
        if (!matches) issues.push(...(results.sort((a, b) => a.length - b.length)[0] ?? [path]));
      }
    }
    if (Array.isArray(value)) {
      if (typeof rule.minItems === 'number' && value.length < rule.minItems) issues.push(path);
      if (record(rule.items) || rule.items === false) for (const item of value) {
        if (tooComplex || issues.length >= 8) break;
        issues.push(...check(item, rule.items, path, depth + 1));
      }
    } else if (record(value)) {
      const props = record(rule.properties) ? rule.properties : {};
      if (Array.isArray(rule.required)) for (const name of rule.required) {
        if (--remaining < 0) { tooComplex = true; return []; }
        if (typeof name !== 'string') continue;
        const requiredValue = Object.hasOwn(value, name) ? value[name] : undefined;
        const field = Object.hasOwn(props, name) ? props[name] : undefined;
        // An explicit minLength: 0 can opt in to empty content. Optional strings
        // and empty strings inside array values (e.g. blank cells) are allowed.
        if (requiredValue === undefined || (blank(requiredValue) && !(record(field) && field.minLength === 0))) {
          issues.push(safeName.test(name) ? name : path);
        }
        if (issues.length >= 8) return issues;
      }
      for (const [name, input] of Object.entries(value)) {
        if (tooComplex || issues.length >= 8) break;
        const child = Object.hasOwn(props, name) ? props[name] : rule.additionalProperties;
        issues.push(...check(input, child, safeName.test(name) ? name : path, depth + 1));
      }
    }
    return issues;
  }

  const issues = check(args, schema, '', 0);
  const fields = [...new Set(issues)].filter(Boolean).slice(0, 4);
  if (tooComplex) return 'I couldn’t safely check this app’s inputs. Try a narrower request. No changes were made.';
  if (fields.length) return `Please provide or correct the required app details: ${fields.map((field) => `\`${field}\``).join(', ')}. No changes were made.`;
  // A root-level constraint can fail without naming a single field.
  if (issues.length) return 'Please clarify the information needed for this app action. No changes were made.';
  return null;
}
