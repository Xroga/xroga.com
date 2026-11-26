// A small stateful simulator of a canvas editor with a menu bar and a Scripts panel (the shape of TraceDraw, but generic: nothing here calls TraceDraw
// code). It answers the layer calls a model makes (snapshot, read, click, press, canvas, wait) so the live harness can see whether a real model
// opens the console, uses run_script_console, and avoids stale Output. States: welcome -> document -> menu -> panel -> ran. The Output area keeps
// the previous document's text on purpose (the stale-Output trap seen live).
import type { FakeHandler } from '@src/agent/testing/fake-layer';

type Phase = 'welcome' | 'document' | 'toolsMenu' | 'scriptsMenu' | 'panel';

export interface SimStats { documents: number; scriptsRun: number; typedPrograms: string[]; exported: boolean; shapes: number; calls: string[] }

export function scriptAppSim(): { handlers: Record<string, FakeHandler>; stats: SimStats; outline: () => string } {
  const stats: SimStats = { documents: 0, scriptsRun: 0, typedPrograms: [], exported: false, shapes: 0, calls: [] };
  let phase: Phase = 'welcome';
  let editor = '// example: print("hello")';
  let output = 'Output: (nothing yet)';
  const menubar = ['menubar', '  menuitem "File"', '  menuitem "Edit"', '  menuitem "Object"', '  menuitem "Text"', '  menuitem "Effects"', '  menuitem "Page"', '  menuitem "Tools"', '  menuitem "Window"', '  menuitem "Help"'];
  const outline = (): string => {
    const lines = [...menubar];
    if (phase === 'welcome') lines.push('tab "Welcome Screen"', 'button "New Document Alt+Shift+N"', 'button "Open Document Ctrl+O"');
    else lines.push(`tab "Untitled-${stats.documents}"`, 'canvas "Drawing area"', `status "Objects on page: ${stats.shapes}"`);
    if (phase === 'toolsMenu') lines.push('menu "Tools"', '  menuitem "Options"', '  menuitem "Scripts"', '  menuitem "Macros"');
    if (phase === 'scriptsMenu') lines.push('menu "Scripts"', '  menuitem "Scripts Panel"', '  menuitem "Run Script..."');
    if (phase === 'panel') lines.push('region "Scripts"', '  tab "JavaScript"', '  button "Run"', '  button "Debug"', '  button "Clear"', '  button "Load..."', '  button "Save..."', '  canvas "Script editor"', '  text "Output"', `  text "${output}"`);
    // Interactive nodes carry a ref like the real outline does: [e3] menuitem "Tools". The ref is stable for a given name.
    return lines.map(l => {
      const m = /^(\s*)(menuitem|button|tab|textbox|canvas|link) "([^"]+)"/.exec(l);
      if (!m) return l;
      const key = m[3]!;
      if (!refs.has(key)) refs.set(key, `e${refs.size + 1}`);
      return `${m[1]}[${refs.get(key)}] ${l.trimStart()}`;
    }).join('\n');
  };
  const refs = new Map<string, string>();
  let lastOutline = '';
  // Like the real layer (observe: diff): an action returns what changed on the page, so the model does not need a snapshot to see the result.
  const diff = (): string => {
    const now = outline().split('\n');
    const before = lastOutline.split('\n');
    const added = now.filter(l => !before.includes(l));
    const gone = before.filter(l => l && !now.includes(l));
    lastOutline = now.join('\n');
    if (!added.length && !gone.length) return '\npage unchanged';
    return '\npage changed:\n' + added.map(l => '+ ' + l.trim()).join('\n') + (gone.length ? '\n' + gone.map(l => '- ' + l.trim()).join('\n') : '');
  };
  const ok = (text: string) => ({ ok: true, text: text + diff(), receipt: { action: 'x', mechanism: 'pointer', dispatched: true, effect: { verdict: 'changed', signals: ['1 mutation'] } } as never });
  const nameOf = (args: Record<string, unknown>): string => {
    const t = (args.target ?? {}) as { name?: string; ref?: string };
    if (t.name) return String(t.name);
    if (t.ref) for (const [name, ref] of refs) if (ref === t.ref) return name;
    return '';
  };
  const newDoc = () => { stats.documents++; stats.shapes = 0; phase = 'document'; };
  const handlers: Record<string, FakeHandler> = {
    snapshot: () => { lastOutline = outline(); return ({ ok: true, text: outline(), page: { tabId: 1, url: 'https://paint.example.test/app/', title: `Editor - Untitled-${stats.documents}`, rev: stats.calls.length + 3 } as never }); },
    read: () => ({ ok: true, text: outline() }),
    screenshot: () => ({ ok: true, text: 'screenshot (not rendered in this simulation; use the outline)' }),
    wait: args => (outline().includes(String(args.text ?? args.textGone ?? '\u0000')) ? ok('wait · met') : ({ ok: false, text: 'TIMEOUT', error: { code: 'TIMEOUT', message: 'not on the page', delivered: false } } as never)),
    press: args => { stats.calls.push(`press:${args.key}`); const k = String(args.key ?? '').toLowerCase(); if (k === 'control+n' || k === 'enter' && phase === 'welcome') newDoc(); return ok(`press ${args.key}`); },
    click: args => {
      const n = nameOf(args); stats.calls.push(`click:${n}`);
      if (/new document/i.test(n)) newDoc();
      else if (n === 'Tools') phase = 'toolsMenu';
      else if (n === 'Scripts' && phase === 'toolsMenu') phase = 'scriptsMenu';
      else if (n === 'Scripts Panel') phase = 'panel';
      else if (n === 'Run' && phase === 'panel') { run(); }
      else if (n === 'Clear' && phase === 'panel') output = 'Output: (nothing yet)';
      return ok(`click ${n}`);
    },
    type: args => { stats.calls.push('type'); if (typeof args.text === 'string') { editor = args.text; stats.typedPrograms.push(editor); } return ok('type'); },
    canvas: args => {
      stats.calls.push(`canvas:${args.action}`);
      if (args.action === 'type' && typeof args.text === 'string') { editor = args.replace ? args.text : editor + args.text; stats.typedPrograms.push(editor); }
      if (args.action === 'key' && /control\+enter|control\+r|f5/i.test(String(args.key))) run();
      if (args.action === 'click' && phase === 'panel') { /* focus the editor */ }
      if (args.action === 'key' && /control\+e/i.test(String(args.key))) stats.exported = true;
      return ok(`canvas ${args.action}`);
    },
  };
  function run() {
    if (phase !== 'panel') return;
    stats.scriptsRun++;
    const created = (editor.match(/Create(?:Rectangle|Ellipse|ArtisticText)/g) ?? []).length;
    if (created === 0) { output = 'Output: TypeError: example text is not a program'; return; }
    stats.shapes += created;
    output = `Output: ${created}`;
  }
  return { handlers, stats, outline };
}
