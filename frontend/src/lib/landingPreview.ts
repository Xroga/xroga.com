/** Build a self-contained HTML document for inline iframe preview (never 404). */
export function buildInlinePreviewDocument(html: string, css: string, js: string): string {
  const inlineCss = css.trim();
  const inlineJs = js.trim();

  if (html.includes('<!DOCTYPE') || html.includes('<html')) {
    let doc = html;
    // External styles.css / script.js links do not load inside srcDoc — inline them.
    doc = doc.replace(/<link[^>]+href=["']styles\.css["'][^>]*>/gi, '');
    doc = doc.replace(/<script[^>]+src=["']script\.js["'][^>]*>\s*<\/script>/gi, '');

    if (inlineCss) {
      const styleBlock = `<style>${inlineCss}</style>`;
      if (doc.includes('</head>')) {
        doc = doc.replace('</head>', `${styleBlock}</head>`);
      } else if (/<body[\s>]/i.test(doc)) {
        doc = doc.replace(/<body/i, `${styleBlock}<body`);
      } else {
        doc = `${styleBlock}${doc}`;
      }
    }

    if (inlineJs) {
      const scriptBlock = `<script>${inlineJs}</script>`;
      if (doc.includes('</body>')) {
        doc = doc.replace('</body>', `${scriptBlock}</body>`);
      } else {
        doc = `${doc}${scriptBlock}`;
      }
    }

    return doc;
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inlineCss}</style></head><body>${html}${inlineJs ? `<script>${inlineJs}</script>` : ''}</body></html>`;
}
