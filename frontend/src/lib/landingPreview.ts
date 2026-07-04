/** Build a self-contained HTML document for inline iframe preview (never 404). */
export function buildInlinePreviewDocument(html: string, css: string, js: string): string {
  if (html.includes('<!DOCTYPE') || html.includes('<html')) {
    if (css.trim() && !html.includes('styles.css') && !html.includes('<style')) {
      return html.replace('</head>', `<style>${css}</style></head>`);
    }
    return html;
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}<script>${js}</script></body></html>`;
}
