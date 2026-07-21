/** Shrink build output for SSE — huge projectFiles/previousFiles often drop the connection after LLM spend. */
export function slimOutputForSse(
  output: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!output || typeof output !== 'object') return output;
  const o: Record<string, unknown> = { ...output };

  if (Array.isArray(o.projectFiles)) {
    o.generatedFiles =
      (Array.isArray(o.generatedFiles) ? o.generatedFiles : null) ??
      (o.projectFiles as Array<{ path?: string }>)
        .map((f) => f.path)
        .filter((p): p is string => typeof p === 'string');
    delete o.projectFiles;
  }
  delete o.previousFiles;

  for (const key of ['html', 'css', 'js'] as const) {
    const v = o[key];
    if (typeof v === 'string' && v.length > 250_000) {
      o[key] = v.slice(0, 250_000);
    }
  }

  if (Array.isArray(o.fileTrail)) {
    o.fileTrail = (o.fileTrail as Array<Record<string, unknown>>).slice(0, 48).map((f) => ({
      path: f.path,
      added: f.added,
      removed: f.removed,
      before: typeof f.before === 'string' ? f.before.slice(0, 3_000) : '',
      after: typeof f.after === 'string' ? f.after.slice(0, 8_000) : '',
    }));
  }

  if (typeof o.message === 'string' && o.message.length > 12_000) {
    o.message = o.message.slice(0, 12_000);
  }

  return o;
}
