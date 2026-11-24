// A page as a PDF: the browser's own print engine (Page.printToPDF over the debugger the extension already uses), as the person's tab shows it. Returns the bytes as base64
// for the Downloads saver. Idea: playwright-mcp's browser_pdf_save (Apache-2.0); written here. Nothing leaves the browser.
export const MAX_PDF_BYTES = 40 * 1024 * 1024;

type Send = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

/** The tab's title, for a file name. */
export function pdfName(title: string | undefined, now = new Date()): string {
  const base = (title ?? '').replace(/[\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80);
  return `${base || 'page'} ${now.toISOString().slice(0, 10)}.pdf`;
}

/** Prints through `send`; an error says what to do. */
export async function printToBase64(send: Send): Promise<{ ok: true; base64: string; bytes: number } | { ok: false; reason: string }> {
  try {
    const out = (await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })) as { data?: string } | undefined;
    if (!out?.data) return { ok: false, reason: 'the browser returned no PDF for this page.' };
    const bytes = Math.floor((out.data.length * 3) / 4);
    if (bytes > MAX_PDF_BYTES) return { ok: false, reason: `the PDF is ${Math.round(bytes / 1048576)} MB, over the ${MAX_PDF_BYTES / 1048576} MB limit.` };
    return { ok: true, base64: out.data, bytes };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Prints a tab with the extension's debugger: attached already by the browser layer during a run, or attached for this one call. */
export async function printTab(tabId: number): Promise<{ ok: true; base64: string; bytes: number } | { ok: false; reason: string }> {
  const target = { tabId };
  const send: Send = (method, params) => chrome.debugger.sendCommand(target, method, params);
  const first = await printToBase64(send);
  if (first.ok || !/not attached|no target/i.test(first.reason)) return first;
  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  try {
    return await printToBase64(send);
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}
