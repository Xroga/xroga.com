// The table tool on real data and real storage: rows from three live Wikipedia search pages (which overlap) are added to a named table with a key, so a page seen twice is one row; the table is
// saved with chrome.storage.local, loaded again by a fresh store (as after a restart), changed, queried, turned into a spreadsheet without the rows passing through any model text, and removed.
import { makeDocumentBytes, normalizeDocument } from '../../agent/document-tool';
import { readXlsx } from '../../agent/office-read';
import { TableStore, runTableTool, tableAsSheet } from '../../agent/table-store';
import { ZipFile } from '../../agent/zip-read';
import { removeTables, tablePersistence } from '../../extension/table-persist';
import { defineScenario, outcome } from './registry';

const page = (term: string, offset: number) => `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=25&sroffset=${offset}&format=json&origin=*`;

defineScenario({
  id: 'S6-tables',
  set: 'C',
  title: 'a named table filled from three live result pages with a key, kept in storage, reloaded, queried and turned into a spreadsheet',
  covers: 'table tool: add with a key (no duplicates across pages), persistence in chrome.storage.local, reload, update with revision, query, delete, tableAsSheet into make_document, removal',
  async run() {
    const id = 'scenario-tables-' + Date.now();
    const persistence = tablePersistence(id);
    let store = new TableStore(await persistence.load());
    const results: Array<{ title: string; wordcount: number; size: number; pageid: number }> = [];
    const fetched: number[] = [];
    // three pages, the second starting inside the first so some rows repeat
    for (const offset of [0, 15, 30]) {
      const answer = (await (await fetch(page('domestic cat', offset))).json()) as { query: { search: Array<{ title: string; wordcount: number; size: number; pageid: number }> } };
      results.push(...answer.query.search);
      fetched.push(answer.query.search.length);
      const r = runTableTool(store, { action: 'add', name: 'Articles', key: 'pageid', rows: answer.query.search }, { extracted: [] });
      if (r.isError) throw new Error(r.text);
      await persistence.save(store.tables);
    }
    const unique = new Set(results.map(r => r.pageid)).size;
    const count = runTableTool(store, { action: 'count', name: 'Articles' }, { extracted: [] });

    // a fresh store, as after a restart of the browser
    store = new TableStore(await persistence.load());
    const reloaded = store.tables.articles?.rows.length ?? 0;
    const first = results[0]!;
    const upd = runTableTool(store, { action: 'update', name: 'Articles', key: String(first.pageid), set: { reviewed: 'yes' } }, { extracted: [] });
    const big = runTableTool(store, { action: 'query', name: 'Articles', steps: [{ op: 'filter', field: 'wordcount', test: 'gte', value: 1000 }, { op: 'sort', by: 'wordcount', order: 'desc' }, { op: 'limit', n: 5 }] }, { extracted: [] });
    const removed = runTableTool(store, { action: 'delete', name: 'Articles', where: { field: 'wordcount', test: 'lt', value: 100 } }, { extracted: [] });
    await persistence.save(store.tables);

    const sheet = tableAsSheet(store, 'Articles', { fields: ['title', 'wordcount', 'size', 'reviewed'] });
    const doc = normalizeDocument({ format: 'xlsx', sheets: [sheet] });
    if (!doc.ok) throw new Error(doc.errors.join('; '));
    const book = await readXlsx(new ZipFile(await makeDocumentBytes(doc.request)));
    const left = store.tables.articles!.rows.length;
    await removeTables(id);
    const gone = Object.keys(await tablePersistence(id).load()).length === 0;

    const checks: Record<string, boolean> = {
      noDuplicates: results.length > unique && left <= unique && reloaded === unique,
      counted: count.text.includes(`${unique} rows`) && count.text.includes('pageid'),
      reloaded: reloaded === unique && reloaded >= 40,
      updated: upd.text.includes('revision 2') && !upd.isError,
      queried: big.text.includes('result:') && !big.isError,
      deleted: removed.text.includes('deleted') && left <= unique,
      spreadsheet: book.length === 1 && book[0]!.rows.length === left + 1 && book[0]!.rows[0]!.cells[0] === 'title',
      removed: gone,
    };
    return outcome(
      'a table fills from three result pages without duplicates, survives a reload, and becomes a spreadsheet',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), fetched, unique, reloaded, left, firstRows: book[0]?.rows.slice(0, 3).map(r => r.cells) }),
      Object.values(checks).every(Boolean),
    );
  },
});
