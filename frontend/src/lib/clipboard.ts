type ClipboardContext = {
  navigator?: { clipboard?: Pick<Clipboard, 'writeText'> };
  document?: Document;
};

/** Copy ordinary text during a user gesture, with a compatibility path for
 * browsers and embedded contexts that cannot use the async Clipboard API. */
export async function copyTextToClipboard(text: string, context: ClipboardContext = globalThis): Promise<boolean> {
  try {
    const clipboard = context.navigator?.clipboard;
    if (typeof clipboard?.writeText === 'function') {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Some browser or embedding permissions block the async API.
  }

  const doc = context.document;
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
  const previousFocus = doc.activeElement as HTMLElement | null;
  const selection = doc.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const field = doc.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  Object.assign(field.style, { position: 'fixed', inset: '0 auto auto 0', opacity: '0', pointerEvents: 'none' });
  try {
    doc.body.append(field);
    field.focus({ preventScroll: true });
    field.select();
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    previousFocus?.focus?.({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
