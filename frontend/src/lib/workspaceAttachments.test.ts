import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const GRID = read('../components/terminal/ChatBarFileGrid.tsx');
const PARTS = read('../components/terminal/ChatBarParts.tsx');
const CSS = read('../app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const VIEW = read('../components/dashboard/DashboardView.tsx');

test('uploaded images are compact square thumbnails rather than wide grid columns', () => {
  assert.match(GRID, /className="xv-chatbar-file-grid"/);
  assert.doesNotMatch(GRID, /grid-cols-4/);
  assert.match(CSS, /\.xv-chatbar-file-grid\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
  assert.match(CSS, /\.xv-file-tile\s*\{[^}]*width:\s*76px[^}]*height:\s*76px[^}]*flex:\s*0 0 76px/);
  assert.match(CSS, /\.xv-file-thumbnail\s*\{[^}]*object-fit:\s*cover/);
});

test('an animated image glyph replaces the IMAGE word and the size stays a compact chip', () => {
  assert.match(GRID, /import \{ ImageIcon \}/);
  assert.match(GRID, /import \{ FileTextIcon \}/);
  assert.match(GRID, /isImage \? <AnimatedIcon icon=\{ImageIcon\} size=\{12\} intro=\{false\} \/> : <AnimatedIcon icon=\{FileTextIcon\} size=\{12\} intro=\{false\} \/>/);
  assert.match(CSS, /\.xv-file-size\s*\{[^}]*max-width:\s*calc\(100% - 8px\)[^}]*white-space:\s*nowrap/);
});

test('PDFs and other documents use the animated file-text glyph everywhere in the chatbar tile', () => {
  assert.doesNotMatch(GRID, /<FileText\b/);
  assert.match(GRID, /<AnimatedIcon icon=\{FileTextIcon\} size=\{48\}/);
  assert.match(GRID, /<AnimatedIcon icon=\{FileTextIcon\} size=\{24\}/);
  assert.doesNotMatch(PARTS, /\bFileText\b/);
  assert.match(PARTS, /<AnimatedIcon icon=\{FileTextIcon\} size=\{24\} intro=\{false\} \/>/);
});

test('a fresh light workspace keeps the same visible outer frame as dark themes', () => {
  assert.match(VIEW, /data-conversation=\{hasConversation \? 'true' : 'false'\}/);
  assert.match(CSS, /\.xv-workspace-shell\.xv-workspace-shell\.xv-workspace-shell[\s\S]*border-color:\s*var\(--app-panel-border\) !important/);
  assert.doesNotMatch(CSS, /terminal-skin-(?:light|light-grid|solar)\.xv-workspace-shell\[data-conversation='false'\][\s\S]*border-color:\s*transparent !important/);
});
