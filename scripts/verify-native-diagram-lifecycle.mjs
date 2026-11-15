import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { basename } from 'node:path';

const compiled = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import {createRoot} from 'react-dom/client';
    import {Diagram} from './frontend/src/components/native-openui/Diagram';
    import './frontend/src/components/native-openui/upstream/components/theme.css';
    import './frontend/src/components/native-openui/surface.css';
    import '@xyflow/react/dist/style.css';
    const Component=Diagram.component, root=createRoot(document.getElementById('root'));
    window.renderDiagram=(label='Next.js')=>root.render(<Component props={{title:'Request path',
      nodes:[{id:'app',label,level:0},{id:'db',label:'PostgreSQL',level:1}],
      links:[{from:'app',to:'db',label:'User access token'}],description:'Authorized request flow.'}}/>);
    window.renderDiagram();` },
  outdir: 'diagram-assets', entryNames: 'diagram', write: false, bundle: true,
  format: 'esm', jsx: 'automatic', tsconfig: 'frontend/tsconfig.json',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const assets = new Map(compiled.outputFiles.map(file => ['/' + basename(file.path), file.contents]));
const server = createServer((req, res) => {
  if (req.url === '/') return res.end('<!doctype html><html><head><link rel="stylesheet" href="/diagram.css"></head><body><main class="xroga-native-openui" id="root"></main><script type="module" src="/diagram.js"></script></body></html>');
  res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css');
  res.end(assets.get(req.url));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const channel = process.env.XROGA_NATIVE_BROWSER ?? 'chrome';
  browser = await chromium.launch(channel === 'chromium' ? {} : {channel});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(() => {
    const Observer = window.ResizeObserver;
    window.ResizeObserver = class extends Observer {
      constructor(callback) { super((entries, observer) => {
        const changed = entries.filter(entry => !window.holdMeasurements || !entry.target.classList.contains('react-flow__node'));
        if (changed.length) callback(changed, observer);
      }); }
    };
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const visible = () => page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')];
    return nodes.length === 2 && nodes.every(node => getComputedStyle(node).visibility === 'visible');
  }, undefined, {timeout:3000});
  await visible();
  await page.evaluate(() => { window.holdMeasurements=true; window.renderDiagram(); });
  await visible();
  assert.equal(await page.locator('.react-flow__edge-path').count(), 1);
  await page.evaluate(() => { window.holdMeasurements=false; window.renderDiagram('Updated API'); });
  await visible();
  await page.locator('.native-diagram-node-title').getByText('Updated API', {exact:true}).waitFor();
  for (const width of [1440,320,390]) {
    await page.setViewportSize({width,height:900});
    await visible();
    assert.ok(await page.locator('.react-flow__edge-path').evaluate(path => path.getTotalLength()>0));
  }
  console.log('Diagram preserves measurements on parent updates, updates changed content, and renders edges after responsive relayout.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
