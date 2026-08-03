import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlLooksTruncated, htmlTagBalance } from './htmlTruncation.js';
import { emptyReferencedAssets, staticValidateProject } from './staticValidate.js';

/**
 * Cover for the dental-clinic run, `85681d10`.
 *
 * The builder returned a 505-line `index.html` that stopped part-way through the page.
 * The reviewer said so plainly — *"index.html appears truncated at line break, missing
 * closing tags and likely several sections"* — alongside a zero-byte `styles.css` and
 * `script.js` that the page linked. Structure validation reported `ok`, so it shipped.
 *
 * The old tag counter could not be made to block anything, because it counted `<meta>`,
 * `<link>` and `<img>` as unclosed elements and needed eight tags of slack to avoid
 * false alarms. These tests pin that the new counter is accurate enough to trust.
 */

const COMPLETE_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Dental clinic">
  <link rel="stylesheet" href="styles.css">
  <title>Lumina Dental</title>
</head>
<body>
  <header><nav><a href="#services">Services</a></nav></header>
  <main>
    <section><h1>Your brightest smile</h1><img src="hero.jpg" alt=""></section>
    <section><form><input type="email"><br><button>Book</button></form></section>
  </main>
  <footer><p>© Lumina</p></footer>
  <script src="script.js"></script>
</body>
</html>`;

const TRUNCATED_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Lumina Dental</title></head>
<body>
  <header><nav><a href="#services">Services</a></nav></header>
  <main>
    <section><h1>Your brightest smile</h1></section>
    <section class="services">
      <h2>Our services</h2>
      <div class="card">`;

test('a complete page with many void elements is not flagged', () => {
  // The exact false positive the old +8 slack existed to hide: six void elements in
  // the head alone.
  assert.equal(htmlLooksTruncated(COMPLETE_PAGE), false);
  assert.equal(htmlTagBalance(COMPLETE_PAGE).unclosed, 0);
});

test('reproduces the run: a page that stops mid-section is detected', () => {
  assert.equal(htmlLooksTruncated(TRUNCATED_PAGE), true);
});

test('the old heuristic could not tell those two apart without slack', () => {
  // Kept as an executable record of why the counter was replaced rather than tuned.
  const naiveOpens = (COMPLETE_PAGE.match(/<[A-Za-z][\w.-]*[^>]*>/g) || []).length;
  const naiveCloses = (COMPLETE_PAGE.match(/<\/[A-Za-z][\w.-]*>/g) || []).length;
  assert.ok(
    naiveOpens > naiveCloses + 2,
    'the naive counter reports a valid page as badly unbalanced',
  );
});

test('a missing </html> is truncation even when the tags happen to balance', () => {
  const noEnd = '<html><head><title>x</title></head><body><div>hi</div></body>';
  assert.equal(htmlTagBalance(noEnd).unclosed, 0);
  assert.equal(htmlLooksTruncated(noEnd), true);
});

test('javascript comparisons inside a script are not read as markup', () => {
  const withScript = COMPLETE_PAGE.replace(
    '<script src="script.js"></script>',
    '<script>if (a < b && c > d) { document.body.className = "x"; }</script>',
  );
  assert.equal(htmlLooksTruncated(withScript), false);
});

test('a css child selector inside a style block is not read as markup', () => {
  const withStyle = COMPLETE_PAGE.replace(
    '</head>',
    '<style>.nav > a { color: red } .a < .b {}</style></head>',
  );
  assert.equal(htmlLooksTruncated(withStyle), false);
});

test('a comment containing tags is ignored', () => {
  const withComment = COMPLETE_PAGE.replace('<body>', '<body><!-- <div><span> -->');
  assert.equal(htmlLooksTruncated(withComment), false);
});

test('optional closing tags are not treated as truncation', () => {
  // `<li>` and `<p>` are routinely left open and the parser closes them.
  const list = `<html><body><ul><li>one<li>two<li>three</ul><p>hi<p>there</body></html>`;
  assert.equal(htmlLooksTruncated(list), false);
});

test('a self-closing element counts as closed', () => {
  const svg = `<html><body><svg><circle r="4" /></svg></body></html>`;
  assert.equal(htmlTagBalance(svg).unclosed, 0);
});

test('an empty document is not truncated', () => {
  assert.equal(htmlLooksTruncated(''), false);
  assert.equal(htmlLooksTruncated('   '), false);
});

test('a fragment is judged on balance alone', () => {
  assert.equal(htmlLooksTruncated('<div><p>hello</p></div>'), false);
  assert.equal(htmlLooksTruncated('<div><section><article>'), true);
});

test('an empty stylesheet the page links is reported', () => {
  const files = [
    { path: 'index.html', content: COMPLETE_PAGE },
    { path: 'styles.css', content: '' },
    { path: 'script.js', content: '' },
  ];
  assert.deepEqual(emptyReferencedAssets(files).sort(), ['script.js', 'styles.css']);
});

test('an empty file nothing links is not a shipping problem', () => {
  const files = [
    { path: 'index.html', content: COMPLETE_PAGE },
    { path: 'unused.css', content: '' },
  ];
  assert.deepEqual(emptyReferencedAssets(files), []);
});

test('a referenced file with real content is fine', () => {
  const files = [
    { path: 'index.html', content: COMPLETE_PAGE },
    { path: 'styles.css', content: 'body { margin: 0 }' },
    { path: 'script.js', content: 'console.log(1)' },
  ];
  assert.deepEqual(emptyReferencedAssets(files), []);
});

test('the dental-clinic file set no longer validates as ok', () => {
  // The whole point: this exact combination was pushed to GitHub with "Structure: ok".
  const result = staticValidateProject([
    { path: 'index.html', content: TRUNCATED_PAGE },
    { path: 'styles.css', content: '' },
    { path: 'script.js', content: '' },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /^Truncated document/.test(issue)), result.issues.join('; '));
});

test('a complete static site still validates, so the check cannot block real work', () => {
  const result = staticValidateProject([
    { path: 'index.html', content: COMPLETE_PAGE },
    { path: 'styles.css', content: ':root { color-scheme: dark }' },
    { path: 'script.js', content: 'document.title = document.title;' },
  ]);
  assert.equal(result.ok, true, result.issues.join('; '));
});
