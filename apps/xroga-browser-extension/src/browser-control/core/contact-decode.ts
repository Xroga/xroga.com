// Email addresses that a page hides from simple readers: Cloudflare's email protection (the address is stored as hex in data-cfemail, XOR-ed with its first byte), and the spelled-out
// forms people write ("name [at] company [dot] com", "name (at) company.com", "name at company dot com" inside an address-looking run), plus the filter for what looks like an address and
// is not (a picture name such as logo@2x.png, a tracking id on sentry.io, an example domain). The source is kept as a string because it runs inside the page, where this file's module is
// not available; the tests run this exact string, so the page and the tests cannot differ. The idea (read the hidden forms and drop the junk) is from reading the website step of
// Mahanaicoach/google-maps-scraper-kit (AGPL-3.0: the idea only; written fresh).
export const CONTACT_DECODE_JS = `
function decodeCf(h){
  try {
    var k = parseInt(h.substr(0, 2), 16), s = '';
    for (var i = 2; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16) ^ k);
    return /^[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}$/.test(s) ? s : '';
  } catch (e) { return ''; }
}
function deob(t){
  return String(t)
    .replace(/&#0*64;|&commat;|%40/gi, '@')
    .replace(/\\s*[\\[({<]\\s*(?:at|@)\\s*[\\])}>]\\s*/gi, '@')
    .replace(/\\s*[\\[({<]\\s*(?:dot|\\.)\\s*[\\])}>]\\s*/gi, '.')
    .replace(/([A-Za-z0-9._%+-]{2,})\\s+at\\s+([A-Za-z0-9-]{2,}(?:\\s+dot\\s+[A-Za-z0-9-]{2,}|\\.[A-Za-z0-9-]{2,})+)/gi, function(m, a, b){ return a + '@' + b.replace(/\\s+dot\\s+/gi, '.'); });
}
function junkEmail(e){
  var l = e.toLowerCase();
  return /\\.(png|jpe?g|gif|svg|webp|avif|css|js|woff2?)$/.test(l) || /@\\d+x\\./.test(l) || /@(sentry|wixpress|example|domain|email|test)\\./.test(l) || /^(you|your|name|user|username|email|someone|yourname)@/.test(l) || /sentry\\.io|\\.wixpress\\.com|@2x|@3x/.test(l);
}
`;
