// A browser stand-in for Node's `path` (POSIX rules), for the Lighthouse bundle's string work on addresses and file names.
const sep = '/';
const isAbsolute = p => p.startsWith('/');
function normalizeParts(p, absolute) {
  const out = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!absolute) out.push('..');
    } else out.push(part);
  }
  return out.join('/');
}
function normalize(p) {
  if (!p) return '.';
  const abs = isAbsolute(p);
  const trailing = p.endsWith('/');
  let n = normalizeParts(p, abs);
  if (!n && !abs) n = '.';
  if (n && trailing) n += '/';
  return (abs ? '/' : '') + n;
}
const join = (...parts) => normalize(parts.filter(Boolean).join('/'));
function resolve(...parts) {
  let resolved = '';
  for (let i = parts.length - 1; i >= 0 && !isAbsolute(resolved); i--) if (parts[i]) resolved = parts[i] + (resolved ? '/' + resolved : '');
  if (!isAbsolute(resolved)) resolved = '/' + resolved;
  return '/' + normalizeParts(resolved, true);
}
function dirname(p) {
  const t = p.replace(/\/+$/, '');
  const i = t.lastIndexOf('/');
  return i < 0 ? '.' : i === 0 ? '/' : t.slice(0, i);
}
function basename(p, ext) {
  const t = p.replace(/\/+$/, '');
  const b = t.slice(t.lastIndexOf('/') + 1);
  return ext && b.endsWith(ext) && b !== ext ? b.slice(0, -ext.length) : b;
}
function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i);
}
function relative(from, to) {
  const a = resolve(from).split('/').filter(Boolean);
  const b = resolve(to).split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}
function parse(p) {
  const base = basename(p);
  const ext = extname(p);
  return { root: isAbsolute(p) ? '/' : '', dir: dirname(p), base, ext, name: ext ? base.slice(0, -ext.length) : base };
}
const posix = { sep, delimiter: ':', isAbsolute, normalize, join, resolve, dirname, basename, extname, relative, parse };
export default { ...posix, posix };
export { sep, isAbsolute, normalize, join, resolve, dirname, basename, extname, relative, parse, posix };
export const delimiter = ':';
