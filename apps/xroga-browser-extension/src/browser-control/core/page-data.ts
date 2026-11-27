// Article extraction (Mozilla Readability, Apache-2.0, run inside the page) and structured data of a page
// (JSON-LD, Open Graph, microdata, contacts, social profiles, feeds). The page scripts only collect; the
// formatting is plain code that unit tests cover.
import { CONTACT_DECODE_JS } from './contact-decode';
import { READABILITY_SOURCE, READERABLE_SOURCE } from './vendor/readability-source';

export interface RawArticle {
  ok: boolean;
  readerable?: boolean;
  title?: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  excerpt?: string;
  lang?: string;
  markdown?: string;
  error?: string;
}

export interface RawPageData {
  title: string;
  url: string;
  canonical?: string;
  lang?: string;
  meta: Record<string, string>;
  jsonld: unknown[];
  microdata: Array<{ type: string; props: Record<string, unknown> }>;
  emails: string[];
  phones: string[];
  social: Record<string, string[]>;
  feeds: string[];
  headings: string[];
}

// Shared by both page scripts: a compact DOM to Markdown converter (headings, lists, tables, code, quotes, links).
const MARKDOWN_SCRIPT = `
function inl(n){
  if(n.nodeType===3) return n.nodeValue.replace(/\\s+/g,' ');
  if(n.nodeType!==1) return '';
  var t=n.tagName.toLowerCase(), c='';
  if(t==='script'||t==='style'||t==='noscript') return '';
  if(t==='br') return '\\n';
  if(t==='img'){ var al=(n.getAttribute('alt')||'').trim(); return al?'[image: '+al+']':''; }
  for(var k=n.firstChild;k;k=k.nextSibling) c+=inl(k);
  if(t==='a'){ var h=n.href; c=c.trim(); return h&&c&&!/^javascript:/i.test(h)?'['+c+']('+h+')':c; }
  if(t==='strong'||t==='b') return c.trim()?'**'+c.trim()+'**':c;
  if(t==='em'||t==='i') return c.trim()?'_'+c.trim()+'_':c;
  if(t==='code') return '\`'+c+'\`';
  return c;
}
var BLOCK={p:1,div:1,section:1,article:1,main:1,header:1,footer:1,aside:1,figure:1,figcaption:1,ul:1,ol:1,li:1,pre:1,blockquote:1,table:1,h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,hr:1,dl:1,dt:1,dd:1,details:1,summary:1,form:1,fieldset:1,address:1,nav:1};
function cellText(c){ return inl(c).replace(/\\s+/g,' ').replace(/\\|/g,'\\\\|').trim(); }
function table(t){
  var rows=[]; for(var i=0;i<t.rows.length;i++){ var cells=[]; for(var j=0;j<t.rows[i].cells.length;j++) cells.push(cellText(t.rows[i].cells[j])); if(cells.length) rows.push(cells); }
  if(!rows.length) return '';
  var w=0; rows.forEach(function(r){ if(r.length>w) w=r.length; });
  function line(r){ var a=r.slice(); while(a.length<w) a.push(''); return '| '+a.join(' | ')+' |'; }
  var out=[line(rows[0]), '|'+new Array(w+1).join(' --- |')];
  for(var r=1;r<rows.length;r++) out.push(line(rows[r]));
  return out.join('\\n');
}
function list(l, ord){
  var items=[], i=0;
  for(var k=l.firstElementChild;k;k=k.nextElementSibling){
    if(k.tagName.toLowerCase()!=='li') continue;
    i++;
    var sub=blk(k).join('\\n').split('\\n');
    var first=(ord?i+'. ':'- ')+sub[0];
    items.push([first].concat(sub.slice(1).map(function(s){return '  '+s;})).join('\\n'));
  }
  return items.join('\\n');
}
function blk(n){
  var out=[], run='';
  function flush(){ var t=run.replace(/[ \\t]+\\n/g,'\\n').replace(/\\n{3,}/g,'\\n\\n').trim(); if(t) out.push(t); run=''; }
  for(var k=n.firstChild;k;k=k.nextSibling){
    var t=k.nodeType===1?k.tagName.toLowerCase():'';
    if(t && BLOCK[t]){
      flush();
      if(/^h[1-6]$/.test(t)){ var x=inl(k).trim(); if(x) out.push(new Array(+t.charAt(1)+1).join('#')+' '+x); }
      else if(t==='p'||t==='figcaption'||t==='dt'||t==='summary'||t==='address'){ var y=inl(k).trim(); if(y) out.push(y); }
      else if(t==='ul'||t==='ol'){ var ls=list(k,t==='ol'); if(ls) out.push(ls); }
      else if(t==='pre'){ out.push('\`\`\`\\n'+k.textContent.replace(/\\n+$/,'')+'\\n\`\`\`'); }
      else if(t==='blockquote'){ var q=blk(k).join('\\n\\n'); if(q) out.push(q.split('\\n').map(function(s){return '> '+s;}).join('\\n')); }
      else if(t==='table'){ var tb=table(k); if(tb) out.push(tb); }
      else if(t==='hr'){ out.push('---'); }
      else out=out.concat(blk(k));
    } else run+=inl(k);
  }
  flush();
  return out;
}
`;

/** The expression that runs Readability on a copy of the page and returns a RawArticle. */
export function articleExpression(): string {
  return `(function(){
var module=undefined;
${READABILITY_SOURCE}
${READERABLE_SOURCE}
${MARKDOWN_SCRIPT}
try{
  var readerable=false; try{ readerable=isProbablyReaderable(document); }catch(e){}
  var copy=document.cloneNode(true);
  var art=new Readability(copy,{keepClasses:false,serializer:function(el){return el;}}).parse();
  if(!art||!art.content) return {ok:false,readerable:readerable,error:'no article body found'};
  var md=blk(art.content).join('\\n\\n');
  return {ok:true,readerable:readerable,title:art.title||'',byline:art.byline||'',siteName:art.siteName||'',publishedTime:art.publishedTime||'',excerpt:art.excerpt||'',lang:art.lang||document.documentElement.lang||'',markdown:md};
}catch(e){ return {ok:false,error:String(e&&e.message||e)}; }
})()`;
}

/** The expression that gathers the structured data of the page and returns a RawPageData. */
export function pageDataExpression(): string {
  return `(function(){
var o={title:document.title||'',url:location.href,meta:{},jsonld:[],microdata:[],emails:[],phones:[],social:{},feeds:[],headings:[]};
var can=document.querySelector('link[rel~="canonical"]'); if(can&&can.href) o.canonical=can.href;
o.lang=document.documentElement.lang||undefined;
Array.prototype.forEach.call(document.querySelectorAll('meta[name],meta[property]'),function(m){
  var k=(m.getAttribute('property')||m.getAttribute('name')||'').toLowerCase(), v=(m.getAttribute('content')||'').trim();
  if(!k||!v||k==='viewport'||k==='theme-color'||/^(format-detection|referrer|robots)$/.test(k)) return;
  if(!(k in o.meta)) o.meta[k]=v.slice(0,500);
});
Array.prototype.forEach.call(document.querySelectorAll('script[type="application/ld+json"]'),function(s){
  try{ var j=JSON.parse(s.textContent||''); var list=Array.isArray(j)?j:(j&&j['@graph']?j['@graph']:[j]); list.forEach(function(x){ if(x&&o.jsonld.length<30) o.jsonld.push(x); }); }catch(e){}
});
function propValue(el){
  var t=el.tagName.toLowerCase();
  if(el.hasAttribute('content')) return el.getAttribute('content');
  if(t==='meta') return el.getAttribute('content');
  if(t==='a'||t==='link'||t==='area') return el.href;
  if(t==='img'||t==='audio'||t==='video'||t==='source'||t==='iframe') return el.src;
  if(t==='time') return el.getAttribute('datetime')||el.textContent.trim();
  if(t==='data'||t==='meter') return el.getAttribute('value');
  return el.textContent.replace(/\\s+/g,' ').trim();
}
function scope(el,depth){
  var r={type:(el.getAttribute('itemtype')||'').split('/').pop()||'Thing',props:{}};
  (function visit(n){
    for(var k=n.firstElementChild;k;k=k.nextElementSibling){
      var name=k.getAttribute('itemprop');
      if(name){
        var val=(k.hasAttribute('itemscope')&&depth<3)?scope(k,depth+1):propValue(k);
        name.split(/\\s+/).forEach(function(nm){ if(!nm) return; var cur=r.props[nm]; if(cur===undefined) r.props[nm]=val; else if(Array.isArray(cur)) cur.push(val); else r.props[nm]=[cur,val]; });
        if(!k.hasAttribute('itemscope')) visit(k);
      } else if(!k.hasAttribute('itemscope')) visit(k);
    }
  })(el);
  return r;
}
Array.prototype.forEach.call(document.querySelectorAll('[itemscope]:not([itemprop])'),function(el){ if(o.microdata.length<30) o.microdata.push(scope(el,0)); });
var em={},ph={};
${CONTACT_DECODE_JS}
Array.prototype.forEach.call(document.querySelectorAll('[data-cfemail]'),function(el){ var d=decodeCf(el.getAttribute('data-cfemail')||''); if(d) em[d.toLowerCase()]=1; });
Array.prototype.forEach.call(document.querySelectorAll('a[href*="/cdn-cgi/l/email-protection#"]'),function(a){ var d=decodeCf((a.getAttribute('href')||'').split('#')[1]||''); if(d) em[d.toLowerCase()]=1; });
Array.prototype.forEach.call(document.querySelectorAll('a[href^="mailto:"]'),function(a){ var v=decodeURIComponent(a.getAttribute('href').slice(7).split('?')[0]).trim(); if(v) em[v.toLowerCase()]=1; });
Array.prototype.forEach.call(document.querySelectorAll('a[href^="tel:"]'),function(a){ var v=decodeURIComponent(a.getAttribute('href').slice(4)).trim(); if(v) ph[v]=1; });
var body=(document.body&&document.body.innerText||'').slice(0,300000);
(deob(body).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}/g)||[]).forEach(function(e){ if(!junkEmail(e)) em[e.toLowerCase()]=1; });
(body.match(/(?:\\+|\\b)\\d[\\d\\s().\\-]{7,18}\\d/g)||[]).forEach(function(p){ var d=p.replace(/\\D/g,''); if(d.length>=8&&d.length<=15&&!/^(19|20)\\d{2}[\\s.\\-]/.test(p.trim())) ph[p.trim()]=1; });
o.emails=Object.keys(em).slice(0,40); o.phones=Object.keys(ph).slice(0,40);
var nets={'twitter.com':'x','x.com':'x','facebook.com':'facebook','instagram.com':'instagram','linkedin.com':'linkedin','youtube.com':'youtube','tiktok.com':'tiktok','github.com':'github','pinterest.com':'pinterest','t.me':'telegram','wa.me':'whatsapp','threads.net':'threads','discord.gg':'discord','reddit.com':'reddit','medium.com':'medium','gitlab.com':'gitlab'};
Array.prototype.forEach.call(document.querySelectorAll('a[href]'),function(a){
  var u; try{ u=new URL(a.href); }catch(e){ return; }
  var h=u.hostname.replace(/^(www|m|mobile)\\./,''); var net=nets[h]; if(!net) return;
  if(u.pathname.length<2||/^\\/(share|sharer|intent|login|signup|dialog|plugins|home|sharer\\.php|share\\.php|tr|policies|policy|privacy|legal|help|about|settings|hashtag|explore|search|watch|events|groups|marketplace|stories|reel|reels|p|i)(\\b|\\/|$)/i.test(u.pathname)) return;
  var handle=u.pathname.split('/')[1]||''; if(/^(squarespace|wix|wixsite|shopify|wordpress|wordpressdotcom|godaddy|weebly|webflow|hubspot|mailchimp|yelp|tripadvisor|opentable|doordash|ubereats|grubhub|toasttab|squareup)$/i.test(handle)) return;
  var list=o.social[net]||(o.social[net]=[]); var s=u.origin+u.pathname.replace(/\\/$/,''); if(list.indexOf(s)<0&&list.length<5) list.push(s);
});
Array.prototype.forEach.call(document.querySelectorAll('link[rel="alternate"][type*="rss"],link[rel="alternate"][type*="atom"]'),function(l){ if(l.href&&o.feeds.indexOf(l.href)<0) o.feeds.push(l.href); });
Array.prototype.forEach.call(document.querySelectorAll('h1,h2,h3'),function(h){ var t=h.textContent.replace(/\\s+/g,' ').trim(); if(t&&o.headings.length<40) o.headings.push(h.tagName.toLowerCase()+' '+t.slice(0,160)); });
return o;
})()`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** The text the model reads for read format article. */
export function formatArticle(raw: RawArticle, fallbackTitle: string): { text: string; usable: boolean } {
  const body = (raw.markdown ?? '').trim();
  if (!raw.ok || body.length < 200) {
    const why = raw.ok ? `the extracted body is only ${body.length} characters` : (raw.error ?? 'no article found');
    return {
      usable: false,
      text: `This page does not read as an article (${why}${raw.readerable === false ? '; the page also does not look like an article' : ''}). Use read with format markdown, or find, for its controls and data.`,
    };
  }
  const head = [`# ${raw.title || fallbackTitle}`];
  const facts = [raw.byline && `by ${raw.byline.trim()}`, raw.siteName, raw.publishedTime && `published ${raw.publishedTime}`, raw.lang && `language ${raw.lang}`].filter(Boolean);
  if (facts.length) head.push(facts.join(' · '));
  if (raw.excerpt) head.push(`Summary: ${clip(raw.excerpt.trim(), 400)}`);
  // The title usually repeats as the first heading of the body.
  const stripped = body.replace(new RegExp(`^#{1,2} ${(raw.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`), '');
  return { usable: true, text: `${head.join('\n')}\n\n${stripped}` };
}

function short(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clip(String(value), 200);
  if (Array.isArray(value)) return value.slice(0, 8).map(v => short(v, depth + 1)).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (depth > 2) return typeof o.name === 'string' ? o.name : '';
    const entries = Object.entries(o)
      .filter(([k]) => k !== '@context')
      .map(([k, v]) => [k.replace(/^@/, ''), short(v, depth + 1)] as const)
      .filter(([, v]) => v);
    return `{${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}}`;
  }
  return '';
}

/** The text the model reads for read format data. */
export function formatPageData(raw: RawPageData): string {
  const out: string[] = [`Structured data of ${raw.url}`, `title: ${raw.title || '(none)'}`];
  if (raw.canonical && raw.canonical !== raw.url) out.push(`canonical: ${raw.canonical}`);
  if (raw.lang) out.push(`language: ${raw.lang}`);
  const metaKeys = Object.keys(raw.meta);
  if (metaKeys.length) {
    out.push('', `Meta tags (${metaKeys.length}):`);
    for (const k of metaKeys.slice(0, 40)) out.push(`  ${k}: ${clip(raw.meta[k], 240)}`);
  }
  if (raw.jsonld.length) {
    out.push('', `JSON-LD (${raw.jsonld.length} items):`);
    for (const item of raw.jsonld.slice(0, 20)) {
      const o = item as Record<string, unknown>;
      const type = Array.isArray(o['@type']) ? (o['@type'] as unknown[]).join('/') : String(o['@type'] ?? 'Thing');
      out.push(`  ${type}: ${clip(short(Object.fromEntries(Object.entries(o).filter(([k]) => k !== '@type'))), 900)}`);
    }
  }
  if (raw.microdata.length) {
    out.push('', `Microdata (${raw.microdata.length} items):`);
    for (const item of raw.microdata.slice(0, 20)) out.push(`  ${item.type}: ${clip(short(item.props), 700)}`);
  }
  if (raw.emails.length) out.push('', `Email addresses: ${raw.emails.join(', ')}`);
  if (raw.phones.length) out.push(`Phone numbers: ${raw.phones.join(', ')}`);
  const nets = Object.keys(raw.social);
  if (nets.length) {
    out.push('', 'Social profiles:');
    for (const n of nets) out.push(`  ${n}: ${raw.social[n].join(', ')}`);
  }
  if (raw.feeds.length) out.push('', `Feeds: ${raw.feeds.join(', ')}`);
  if (raw.headings.length) out.push('', 'Headings:', ...raw.headings.slice(0, 40).map(h => `  ${h}`));
  const none = !metaKeys.length && !raw.jsonld.length && !raw.microdata.length && !raw.emails.length && !raw.phones.length && !nets.length;
  if (none) out.push('', 'This page publishes no structured data, contact details or social profiles.');
  return out.join('\n');
}
