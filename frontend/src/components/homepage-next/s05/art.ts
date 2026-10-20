/**
 * S05 tile art: thirteen original compositions on one 300 × 160 canvas, anchored to the tile's lower edge and running
 * off it. One vocabulary throughout: graphite panels (s5-p1..p3), one light "paper" tone for high-contrast surfaces,
 * thick round strokes, 10 to 16 radii, and each tile's accent pair (--c1, --c2, sometimes --c3) at full colour even at
 * rest. Motion lives in S05.css under `[data-on]` (hover, keyboard focus or tap): transform, opacity and stroke offsets.
 *
 * The markup is static, trusted and authored here (no visitor data), so the component and the design studio render
 * exactly the same thing.
 */
import type { CapabilityId } from './capabilities';

const svg = (id: CapabilityId, body: string) =>
  `<svg class="s5-art" data-art="${id}" viewBox="0 0 300 160" aria-hidden="true" focusable="false">${body}</svg>`;

/* 01 Travel & Bookings: a flight path from origin to destination; an airliner flies it */
const ROUTE = 'M48 112C100 34 196 22 254 50';
const travel = svg(
  'travel',
  `<path class="s5-flightRest" d="${ROUTE}"/>
  <path class="s5-flight s5-draw" d="${ROUTE}" pathLength="1"/>
  <circle class="s5-origin" cx="48" cy="112" r="7"/>
  <rect class="s5-code" x="30" y="128" width="36" height="10" rx="5"/>
  <g class="s5-destG">
    <circle class="s5-destRing" cx="254" cy="50" r="13"/>
    <circle class="s5-c2" cx="254" cy="50" r="6"/>
  </g>
  <rect class="s5-code" x="236" y="72" width="36" height="10" rx="5"/>
  <g class="s5-planeG" style="offset-path: path('${ROUTE}')">
    <path class="s5-plane" d="M17 0c0-1.7-1.6-2.7-4-2.7H4L-6-14h-5l4.2 11.3H-12l-3.8-4.6h-3.4L-16.6 0l-2.6 7.3h3.4L-12 2.7h5.2L-11 14h5L4 2.7h9c2.4 0 4-1 4-2.7z"/>
  </g>`,
);

/* 02 Email & Calendars: an envelope and a calendar side by side; a message becomes an event */
const CELLS = [0, 1, 2]
  .map((r) => [0, 1, 2, 3].map((c) => `<rect class="s5-cell" x="${166 + c * 30}" y="${74 + r * 26}" width="24" height="20" rx="4"/>`).join(''))
  .join('');
const mail = svg(
  'mail',
  `<g class="s5-cal">
    <rect class="s5-p1" x="156" y="30" width="134" height="150" rx="14"/>
    <rect class="s5-c2" x="156" y="30" width="134" height="30" rx="14"/>
    <rect class="s5-c2" x="156" y="46" width="134" height="14"/>
    <rect class="s5-calPin" x="182" y="24" width="6" height="14" rx="3"/>
    <rect class="s5-calPin" x="258" y="24" width="6" height="14" rx="3"/>
    ${CELLS}
    <rect class="s5-slotHl" x="226" y="100" width="24" height="20" rx="4"/>
  </g>
  <g class="s5-envG">
    <rect class="s5-c1" x="34" y="72" width="96" height="64" rx="9"/>
    <path class="s5-envFold" d="M36 133l36-28M128 133l-36-28"/>
    <path class="s5-flap" d="M36 75l46 32 46-32"/>
  </g>
  <rect class="s5-evChip" x="68" y="96" width="28" height="12" rx="4"/>`,
);

/* 03 CRM & Support: a contact record beside a pipeline; the deal moves on, the record links up */
const crm = svg(
  'crm',
  `<g class="s5-board">
    <rect class="s5-p1" x="146" y="16" width="170" height="160" rx="16"/>
    <rect class="s5-c2" x="160" y="30" width="34" height="6" rx="3"/>
    <rect class="s5-p3" x="210" y="30" width="30" height="6" rx="3"/>
    <rect class="s5-p3" x="258" y="30" width="34" height="6" rx="3"/>
    <rect class="s5-p2" x="158" y="48" width="44" height="30" rx="7"/>
    <rect class="s5-p2" x="208" y="48" width="44" height="30" rx="7"/>
    <rect class="s5-p2" x="258" y="48" width="44" height="30" rx="7"/>
    <rect class="s5-p2" x="208" y="86" width="44" height="30" rx="7"/>
    <rect class="s5-p2" x="158" y="124" width="44" height="30" rx="7"/>
    <circle class="s5-c2" cx="168" cy="58" r="4"/><circle class="s5-c1" cx="218" cy="58" r="4"/><circle class="s5-c1" cx="268" cy="58" r="4"/>
    <circle class="s5-c2" cx="218" cy="96" r="4"/><circle class="s5-p3" cx="168" cy="134" r="4"/>
    <g class="s5-deal">
      <rect class="s5-c1" x="158" y="86" width="44" height="30" rx="7"/>
      <rect class="s5-ink" x="166" y="94" width="22" height="5" rx="2.5"/>
      <rect class="s5-ink" x="166" y="104" width="14" height="4" rx="2"/>
    </g>
  </g>
  <path class="s5-link-rest" d="M136 92C150 92 150 101 158 101"/>
  <path class="s5-link s5-draw" d="M136 92C150 92 150 101 158 101" pathLength="1"/>
  <g class="s5-contact">
    <rect class="s5-paper" x="16" y="34" width="122" height="108" rx="16"/>
    <circle class="s5-c1" cx="48" cy="66" r="17"/>
    <circle class="s5-paper" cx="48" cy="61" r="6"/>
    <path class="s5-paper" d="M37 76a11 9 0 0 1 22 0z"/>
    <rect class="s5-ink" x="74" y="56" width="50" height="8" rx="4"/>
    <rect class="s5-inkL" x="74" y="70" width="34" height="6" rx="3"/>
    <rect class="s5-inkL" x="30" y="96" width="94" height="6" rx="3"/>
    <rect class="s5-inkL" x="30" y="108" width="70" height="6" rx="3"/>
    <rect class="s5-tag" x="30" y="122" width="46" height="12" rx="6"/>
    <circle class="s5-status" cx="122" cy="128" r="6"/>
  </g>`,
);

/* 04 Payments & Accounting: a card over an invoice; the ledger reconciles to a checked total */
const ledger = [
  [44, 50, 10],
  [58, 38, -12],
  [72, 56, 16],
  [86, 30, -8],
];
const payments = svg(
  'payments',
  `<g class="s5-invoice">
    <rect class="s5-paper" x="150" y="14" width="140" height="170" rx="14"/>
    <rect class="s5-c2" x="164" y="26" width="40" height="8" rx="4"/>
    <rect class="s5-inkL" x="242" y="26" width="34" height="8" rx="4"/>
    ${ledger.map(([y, w, dx], i) => `<rect class="s5-inkL s5-lrow" x="${276 - w}" y="${y + 6}" width="${w}" height="7" rx="3.5" style="--dx:${dx}px;--i:${i}"/><rect class="s5-inkL" x="164" y="${y + 6}" width="24" height="7" rx="3.5"/>`).join('')}
    <rect class="s5-rule" x="164" y="110" width="112" height="2.5" rx="1.25"/>
    <rect class="s5-c1 s5-total" x="214" y="120" width="62" height="12" rx="6"/>
    <rect class="s5-ink" x="164" y="120" width="36" height="12" rx="6"/>
    <circle class="s5-paid" cx="270" cy="148" r="13"/>
    <path class="s5-tick s5-draw" d="M263 148l5 5 9-10" pathLength="1"/>
  </g>
  <g class="s5-card">
    <rect class="s5-c1" x="16" y="58" width="156" height="98" rx="14"/>
    <rect class="s5-chip" x="34" y="84" width="28" height="22" rx="5"/>
    <path class="s5-wave" d="M146 82a12 12 0 0 1 0 16M152 77a19 19 0 0 1 0 26"/>
    <rect class="s5-cardline" x="34" y="122" width="26" height="7" rx="3.5"/>
    <rect class="s5-cardline" x="66" y="122" width="26" height="7" rx="3.5"/>
    <rect class="s5-cardline" x="98" y="122" width="26" height="7" rx="3.5"/>
    <rect class="s5-cardline" x="130" y="122" width="26" height="7" rx="3.5"/>
  </g>`,
);

/* 05 Workflow Templates: a preset board; modules snap into their slots and the preset completes */
const slots = [
  [104, 34],
  [166, 34],
  [228, 34],
  [104, 94],
  [166, 94],
  [228, 94],
];
// at rest three slots wait empty; the missing modules slide a short way into them, one after another
const modFrom = ['0px,0px,0deg', '0px,0px,0deg', '-16px,0px,0deg', '0px,0px,0deg', '-16px,0px,0deg', '-16px,0px,0deg'];
const modClass = ['s5-c1', 's5-p3', 's5-c1', 's5-p3', 's5-c2', 's5-p3'];
const templates = svg(
  'templates',
  `<rect class="s5-frame" x="92" y="22" width="210" height="140" rx="18"/>
  ${slots.map(([x, y]) => `<rect class="s5-slot" x="${x}" y="${y}" width="54" height="50" rx="8"/>`).join('')}
  <g class="s5-preset"><rect class="s5-paper" x="196" y="12" width="70" height="20" rx="10"/><circle class="s5-c1" cx="209" cy="22" r="4.5"/><rect class="s5-ink" x="218" y="19" width="38" height="6" rx="3"/></g>
  ${slots
    .map(([x, y], i) => {
      const [tx, ty, r] = modFrom[i].split(',');
      const glyph = i % 3 === 0 ? `<path class="s5-glyph" d="M${x + 14} ${y + 25}h26M${x + 27} ${y + 12}v26"/>` : i % 3 === 1 ? `<circle class="s5-glyph" cx="${x + 27}" cy="${y + 25}" r="10"/>` : `<path class="s5-glyph" d="M${x + 15} ${y + 33}l12-16 12 16z"/>`;
      return `<g class="s5-mod" style="--tx:${tx};--ty:${ty};--r:${r};--i:${[2, 4, 5].indexOf(i) + 1};--o:${tx === '0px' ? 1 : 0}"><rect class="${modClass[i]}" x="${x}" y="${y}" width="54" height="50" rx="8"/>${glyph}</g>`;
    })
    .join('')}`,
);

/* 06 Workflows & Triggers: a scheduled trigger fires; the condition chooses a branch; the outcome lights */
const triggers = svg(
  'triggers',
  `<circle class="s5-sched" cx="58" cy="96" r="40"/>
  <path class="s5-wire" d="M86 96h46"/>
  <path class="s5-wire" d="M168 96c26 0 26-44 54-44h18"/>
  <path class="s5-wire s5-wire-off" d="M168 96c26 0 26 40 54 40h18"/>
  <path class="s5-branch s5-draw" d="M86 96h46" pathLength="1"/>
  <path class="s5-branch s5-draw s5-branch2" d="M168 96c26 0 26-44 54-44h18" pathLength="1"/>
  <circle class="s5-c1 s5-trig" cx="58" cy="96" r="28"/>
  <path class="s5-paper" d="M61 79 48 99h10l-4 17 15-22h-10z"/>
  <rect class="s5-cond" x="133" y="79" width="34" height="34" rx="7"/>
  <rect class="s5-c2 s5-outA" x="240" y="32" width="70" height="40" rx="12"/>
  <rect class="s5-paper" x="254" y="46" width="30" height="5" rx="2.5"/>
  <rect class="s5-paper s5-dim" x="254" y="56" width="20" height="4" rx="2"/>
  <rect class="s5-p2" x="240" y="118" width="70" height="40" rx="12"/>
  <rect class="s5-p3" x="254" y="132" width="30" height="5" rx="2.5"/>
  <circle class="s5-sig" cx="0" cy="0" r="6"/>`,
);

/* 07 Coding & Repositories: a miniature IDE: tree, code, inline diff, branch and checks */
const code = (y: number, parts: [string, number][], indent = 0) => {
  let x = 104 + indent;
  return parts.map(([c, w]) => { const r = `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="6" rx="3"/>`; x += w + 5; return r; }).join('');
};
const coding = svg(
  'coding',
  `<g transform="translate(0 10)"><rect class="s5-p1" x="8" y="8" width="310" height="180" rx="16"/>
  <rect class="s5-p2" x="8" y="8" width="310" height="26" rx="16"/>
  <rect class="s5-p2" x="8" y="22" width="310" height="12"/>
  <circle class="s5-dotR" cx="24" cy="21" r="4"/><circle class="s5-dotY" cx="37" cy="21" r="4"/><circle class="s5-dotG" cx="50" cy="21" r="4"/>
  <rect class="s5-tab" x="94" y="13" width="72" height="16" rx="6"/><rect class="s5-c1" x="102" y="19" width="10" height="5" rx="2.5"/><rect class="s5-inkL" x="116" y="19" width="40" height="5" rx="2.5"/>
  <rect class="s5-tree" x="8" y="34" width="78" height="154"/>
  <path class="s5-c1" d="M18 46h10l3 3h12v10H18z"/><rect class="s5-treeTxt" x="48" y="49" width="26" height="5" rx="2.5"/>
  <rect class="s5-c2" x="28" y="64" width="9" height="9" rx="2"/><rect class="s5-treeTxt" x="42" y="66" width="30" height="5" rx="2.5"/>
  <rect class="s5-treeSel" x="12" y="78" width="70" height="15" rx="4"/>
  <rect class="s5-c1" x="28" y="81" width="9" height="9" rx="2"/><rect class="s5-paper" x="42" y="83" width="28" height="5" rx="2.5"/>
  <rect class="s5-c3" x="28" y="98" width="9" height="9" rx="2"/><rect class="s5-treeTxt" x="42" y="100" width="24" height="5" rx="2.5"/>
  <path class="s5-c1" d="M18 114h10l3 3h12v10H18z"/><rect class="s5-treeTxt" x="48" y="117" width="22" height="5" rx="2.5"/>
  ${[44, 58, 72, 86, 100, 114, 128, 142].map((y, i) => `<rect class="s5-lnum" x="92" y="${y}" width="${i === 9 ? 9 : 6}" height="6" rx="2"/>`).join('')}
  <rect class="s5-hl" x="88" y="54" width="198" height="14" rx="3"/>
  ${code(44, [['s5-kw', 30], ['s5-fn', 44], ['s5-txt', 22]])}
  ${code(58, [['s5-kw', 22], ['s5-txt', 34], ['s5-str', 48]], 12)}
  <g class="s5-del"><rect class="s5-delBg" x="88" y="68" width="198" height="14" rx="3"/>${code(72, [['s5-txt', 26], ['s5-delTxt', 70]], 12)}</g>
  <g class="s5-add"><rect class="s5-addBg" x="88" y="68" width="198" height="14" rx="3"/>${code(72, [['s5-txt', 26], ['s5-fn', 38], ['s5-str', 34]], 12)}</g>
  ${code(86, [['s5-kw', 26], ['s5-txt', 52]], 12)}
  ${code(100, [['s5-fn', 40], ['s5-txt', 30], ['s5-str', 26]], 24)}
  ${code(114, [['s5-txt', 18]], 12)}
  ${code(128, [['s5-kw', 34], ['s5-fn', 30]])}
  ${code(142, [['s5-txt', 42], ['s5-str', 40]], 12)}
  <path class="s5-git" d="M296 40v150"/>
  <circle class="s5-commit" cx="296" cy="52" r="5"/><circle class="s5-commit" cx="296" cy="96" r="5"/>
  <path class="s5-gitB s5-draw" d="M296 96c0 14-12 14-12 28v22" pathLength="1"/>
  <circle class="s5-newCommit" cx="284" cy="146" r="6"/>
  <g class="s5-check"><circle class="s5-checkBg" cx="290" cy="21" r="9"/><path class="s5-checkTick s5-draw" d="M285.5 21l3 3 6-6.5" pathLength="1"/></g></g>`,
);

/* 08 Custom APIs & MCPs: your tool and Xroga dock through an authorized connector; data flows */
const apis = svg(
  'apis',
  `<path class="s5-flowRest" d="M64 128c0 26 172 26 172 0"/>
  <path class="s5-flow" d="M64 128c0 26 172 26 172 0"/>
  <g class="s5-plug">
    <rect class="s5-c2" x="14" y="50" width="100" height="78" rx="18"/>
    <rect class="s5-paper" x="114" y="66" width="22" height="9" rx="3"/>
    <rect class="s5-paper" x="114" y="84" width="22" height="9" rx="3"/>
    <rect class="s5-paper" x="114" y="102" width="22" height="9" rx="3"/>
    <path class="s5-brace" d="M64 89 42 72M64 89l22-17M64 89v24"/>
    <circle class="s5-paper" cx="64" cy="89" r="9"/>
    <circle class="s5-paper" cx="42" cy="72" r="5"/><circle class="s5-paper" cx="86" cy="72" r="5"/><circle class="s5-paper" cx="64" cy="113" r="5"/>
  </g>
  <g class="s5-socket">
    <rect class="s5-p2" x="186" y="50" width="100" height="78" rx="18"/>
    <rect class="s5-p1" x="186" y="65" width="12" height="11" rx="3"/>
    <rect class="s5-p1" x="186" y="83" width="12" height="11" rx="3"/>
    <rect class="s5-p1" x="186" y="101" width="12" height="11" rx="3"/>
    <rect class="s5-p3" x="214" y="70" width="52" height="7" rx="3.5"/>
    <rect class="s5-p3" x="214" y="84" width="38" height="7" rx="3.5"/>
    <circle class="s5-led" cx="266" cy="108" r="6"/>
  </g>
  <g class="s5-key">
    <path class="s5-c1" d="M150 10l22 12v18c0 14-10 22-22 26-12-4-22-12-22-26V22z"/>
    <circle class="s5-p1" cx="150" cy="34" r="6"/><rect class="s5-p1" x="147" y="36" width="6" height="12" rx="2"/>
  </g>
  ${[0, 1, 2].map((i) => `<rect class="s5-packet" x="-6" y="-6" width="12" height="12" rx="3" style="--i:${i}"/>`).join('')}`,
);

/* 09 Web3 & Blockchain: blocks on a chain; the links light and a new block lands in place */
const cube = (x: number, y: number, top: string, l: string, r: string) =>
  `<path class="${top}" d="M${x} ${y - 18}l30 17-30 17-30-17z"/><path class="${l}" d="M${x - 30} ${y - 1}l30 17v34l-30-17z"/><path class="${r}" d="M${x + 30} ${y - 1}l-30 17v34l30-17z"/>`;
const web3 = svg(
  'web3',
  `<path class="s5-chainRest" d="M48 100 108 66 168 100 228 66"/>
  <path class="s5-chain s5-draw" d="M48 100 108 66 168 100 228 66" pathLength="1"/>
  <path class="s5-slotIso" d="M228 48l30 17-30 17-30-17z"/>
  ${[
    [48, 100],
    [108, 66],
    [168, 100],
  ]
    .map(([x, y], i) => `<g class="s5-blk" style="--i:${i}">${cube(x, y, 's5-c2', 's5-c1', 's5-c1d')}</g>`)
    .join('')}
  <g class="s5-drop">${cube(228, 66, 's5-gold', 's5-goldL', 's5-goldD')}</g>
  <circle class="s5-spark" cx="228" cy="48" r="4"/>`,
);

/* 10 Hackathons & Projects: requirements tick off, progress runs the milestones, the flag goes up */
const hackathons = svg(
  'hackathons',
  `<g class="s5-brief">
    <rect class="s5-paper" x="14" y="22" width="118" height="112" rx="14"/>
    ${[44, 72, 100]
      .map((y, i) => `<rect class="s5-box" x="28" y="${y}" width="16" height="16" rx="4" style="--i:${i}"/><path class="s5-boxTick s5-draw" d="M31.5 ${y + 8}l3.5 3.5 6-7" pathLength="1" style="--i:${i}"/><rect class="s5-inkL" x="52" y="${y + 2}" width="${[62, 48, 56][i]}" height="5" rx="2.5"/><rect class="s5-inkL2" x="52" y="${y + 10}" width="${[40, 54, 30][i]}" height="4" rx="2"/>`)
      .join('')}
  </g>
  <path class="s5-hkRail" d="M150 132H272"/>
  <path class="s5-prog" d="M150 132H272" pathLength="1"/>
  ${[150, 196, 242].map((x, i) => `<circle class="s5-ms" cx="${x}" cy="132" r="11" style="--i:${i}"/>`).join('')}
  <rect class="s5-p3" x="270" y="56" width="5" height="88" rx="2.5"/>
  <path class="s5-c2 s5-flag" d="M275 58h34l-9 13 9 13h-34z"/>`,
);

/* 11 Desktop Applications: a cascade of app windows that shifts and snaps into a tidy workspace */
const win = (x: number, y: number, bar: string, body: string, inner: string) =>
  `<rect class="${body}" x="${x}" y="${y}" width="150" height="104" rx="12"/><rect class="${bar}" x="${x}" y="${y}" width="150" height="20" rx="12"/><rect class="${bar}" x="${x}" y="${y + 12}" width="150" height="8"/>
  <circle class="s5-wdot" cx="${x + 13}" cy="${y + 10}" r="3.2"/><circle class="s5-wdot" cx="${x + 24}" cy="${y + 10}" r="3.2"/><circle class="s5-wdot" cx="${x + 35}" cy="${y + 10}" r="3.2"/>${inner}`;
const desktop = svg(
  'desktop',
  `<g class="s5-w1">${win(26, 14, 's5-c2', 's5-p2', `<rect class="s5-p3" x="40" y="46" width="70" height="8" rx="4"/><rect class="s5-p3" x="40" y="60" width="50" height="8" rx="4"/>`)}</g>
  <g class="s5-w2">${win(78, 36, 's5-c1', 's5-p1', `<rect class="s5-p2" x="88" y="66" width="38" height="64" rx="6"/><rect class="s5-p3" x="134" y="68" width="80" height="7" rx="3.5"/><rect class="s5-p2" x="134" y="82" width="62" height="7" rx="3.5"/>`)}</g>
  <g class="s5-w3">${win(130, 58, 's5-p3', 's5-paper', `<rect class="s5-c1" x="140" y="88" width="36" height="64" rx="6"/><rect class="s5-ink" x="184" y="90" width="84" height="8" rx="4"/><rect class="s5-inkL" x="184" y="104" width="64" height="7" rx="3.5"/><rect class="s5-c2" x="184" y="120" width="44" height="22" rx="6"/>`)}</g>
  <g class="s5-dockG"><rect class="s5-dock" x="60" y="148" width="150" height="26" rx="10"/>${['s5-c1', 's5-c2', 's5-gold', 's5-em'].map((c, i) => `<rect class="${c} s5-app" x="${74 + i * 32}" y="153" width="18" height="16" rx="5" style="--i:${i}"/>`).join('')}</g>`,
);

/* 12 Domains & Infrastructure: the address goes secure as the route resolves through DNS, servers and data */
const infra = svg(
  'infra',
  `<rect class="s5-paper" x="12" y="12" width="290" height="32" rx="16"/>
  <circle class="s5-lockBg" cx="32" cy="28" r="10"/>
  <path class="s5-shackle" d="M28.5 26v-3a3.5 3.5 0 0 1 7 0v3"/><rect class="s5-lockBody" x="27" y="25.5" width="10" height="8" rx="2"/>
  <rect class="s5-https" x="50" y="24" width="34" height="8" rx="4"/><rect class="s5-ink" x="90" y="24" width="72" height="8" rx="4"/><rect class="s5-inkL" x="168" y="24" width="40" height="8" rx="4"/>
  <path class="s5-routeRest" d="M74 112h34M180 112h36"/>
  <path class="s5-net s5-draw" d="M74 112h34M180 112h36" pathLength="1"/>
  <circle class="s5-c2" cx="48" cy="112" r="26"/>
  <ellipse class="s5-meridian" cx="48" cy="112" rx="11" ry="26"/><path class="s5-meridian" d="M22 112h52M26 99h44M26 125h44"/>
  ${[86, 108, 130].map((y, i) => `<rect class="s5-p2" x="108" y="${y}" width="72" height="18" rx="5"/><circle class="s5-ledS" cx="120" cy="${y + 9}" r="3.5" style="--i:${i}"/><rect class="s5-p3" x="130" y="${y + 7}" width="38" height="4" rx="2"/>`).join('')}
  <path class="s5-c1" d="M216 96c0-6 14-10 30-10s30 4 30 10v40c0 6-14 10-30 10s-30-4-30-10z"/>
  <ellipse class="s5-dbTop" cx="246" cy="96" rx="30" ry="10"/>
  <path class="s5-dbLine" d="M216 112c0 6 14 10 30 10s30-4 30-10M216 126c0 6 14 10 30 10s30-4 30-10"/>
  <circle class="s5-pulse" cx="0" cy="0" r="5"/>`,
);

/* 13 Live Operations: a live dashboard; a telemetry pulse runs, the incident clears, services report healthy */
const ops = svg(
  'ops',
  `<rect class="s5-p1" x="10" y="12" width="300" height="170" rx="16"/>
  ${[0, 1, 2].map((i) => `<rect class="s5-p2" x="${24 + i * 64}" y="24" width="56" height="20" rx="10"/><circle class="s5-svc" cx="${36 + i * 64}" cy="34" r="4.5" style="--i:${i}"/><rect class="s5-p3" x="${46 + i * 64}" y="31" width="26" height="6" rx="3"/>`).join('')}
  <circle class="s5-gauge" cx="58" cy="108" r="32"/>
  <circle class="s5-gaugeArc" cx="58" cy="108" r="32" pathLength="1"/>
  <circle class="s5-c1" cx="58" cy="108" r="9"/>
  <path class="s5-gridL" d="M110 76h190M110 108h190M110 140h190"/>
  <path class="s5-spike" d="M110 124h40l10-8 10 6 8-44 10 70 8-28 12 4h92"/>
  <path class="s5-calm s5-draw" d="M110 124h40l10-8 10 6 8-6 10 4 8-2 12 4h92" pathLength="1"/>
  <path class="s5-tele" d="M110 124h40l10-8 10 6 8-6 10 4 8-2 12 4h92" pathLength="1"/>`,
);

export const ART: Record<CapabilityId, string> = {
  travel,
  mail,
  crm,
  payments,
  templates,
  triggers,
  coding,
  apis,
  web3,
  hackathons,
  desktop,
  infra,
  ops,
};
