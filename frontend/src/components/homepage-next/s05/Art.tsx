/**
 * S05 tile art: one original, flat SVG per capability on a 240 × 120 canvas, anchored to the tile's lower right and
 * running off its bottom edge. At rest every piece is neutral grey with a muted accent; when the tile is hovered,
 * focused or tapped (Art.module.css, `.s05Tile:is(:hover, :focus-visible, [data-on])`) the accent saturates and the
 * pieces move in a way that says what the capability does. Motion is CSS only: transform, opacity and stroke offsets.
 */
import type { CapabilityId } from './capabilities';
import a from './Art.module.css';

function Travel() {
  const arc = 'M34 112C70 30 160 20 206 70';
  return (
    <>
      <path className={a.faint} d={arc} strokeDasharray="2 7" />
      <path className={`${a.draw} ${a.accS}`} d={arc} pathLength={1} />
      <circle className={a.inkL} cx="34" cy="112" r="6" />
      <circle className={`${a.accS} ${a.dest}`} cx="206" cy="70" r="10" />
      <circle className={`${a.acc} ${a.destDot}`} cx="206" cy="70" r="4.5" />
      <g className={a.mark}>
        <path className={a.acc} d="M-6 -5 7 0-6 5-3 0z" />
      </g>
      <g className={a.itin}>
        <rect className={a.inkL} x="164" y="92" width="44" height="7" rx="3.5" />
        <rect className={a.ink} x="164" y="104" width="34" height="7" rx="3.5" />
        <rect className={a.acc} x="164" y="116" width="24" height="7" rx="3.5" />
      </g>
    </>
  );
}

function Mail() {
  return (
    <>
      <rect className={a.ink} x="132" y="30" width="90" height="86" rx="9" />
      <rect className={a.accM} x="132" y="30" width="90" height="16" rx="8" />
      <rect className={a.inkL} x="150" y="24" width="5" height="12" rx="2.5" />
      <rect className={a.inkL} x="199" y="24" width="5" height="12" rx="2.5" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} className={a.cell} x={140 + c * 19} y={54 + r * 18} width="15" height="13" rx="2.5" />),
      )}
      <rect className={`${a.acc} ${a.slot}`} x="178" y="72" width="15" height="13" rx="2.5" />
      <g className={a.ticks}>
        <rect className={a.acc} x="178" y="92" width="15" height="3" rx="1.5" />
        <rect className={a.inkL} x="159" y="92" width="15" height="3" rx="1.5" />
      </g>
      <rect className={a.inkD} x="22" y="62" width="78" height="54" rx="7" />
      <g className={a.letter}>
        <rect className={a.accM} x="32" y="66" width="58" height="34" rx="4" />
        <rect className={a.paper} x="38" y="74" width="34" height="3.5" rx="1.75" />
        <rect className={a.paper} x="38" y="82" width="44" height="3.5" rx="1.75" />
      </g>
      <rect className={a.ink} x="22" y="88" width="78" height="28" rx="0" />
      <path className={`${a.flap} ${a.inkStroke}`} d="M23 63 61 90 99 63" />
    </>
  );
}

function Crm() {
  const nodes: [number, number, string][] = [
    [34, 56, 'M42 58H96'],
    [48, 106, 'M56 102 96 84'],
    [210, 50, 'M202 54H160'],
    [218, 102, 'M210 98 160 84'],
  ];
  return (
    <>
      {nodes.map(([, , d], i) => (
        <g key={i}>
          <path className={a.faint} d={d} strokeDasharray="2 5" />
          <path className={`${a.draw} ${a.accS} ${a.link}`} d={d} pathLength={1} style={{ ['--i' as string]: i }} />
        </g>
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} className={`${a.node} ${a.inkL}`} cx={x} cy={y} r="8.5" style={{ ['--i' as string]: i }} />
      ))}
      <rect className={a.ink} x="96" y="40" width="64" height="76" rx="9" />
      <circle className={a.accM} cx="112" cy="56" r="7" />
      <rect className={a.inkL} x="124" y="52" width="26" height="4" rx="2" />
      <rect className={a.inkL} x="124" y="60" width="18" height="4" rx="2" />
      <rect className={a.inkD} x="106" y="74" width="44" height="4" rx="2" />
      <rect className={a.inkD} x="106" y="82" width="34" height="4" rx="2" />
      {[0, 1, 2].map((i) => (
        <circle key={i} className={`${a.step} ${a.inkL}`} cx={110 + i * 13} cy="100" r="3.5" style={{ ['--i' as string]: i }} />
      ))}
    </>
  );
}

function Payments() {
  const rows: [number, number, number][] = [
    [44, 74, 12],
    [56, 54, -9],
    [68, 66, 15],
    [80, 44, -6],
  ];
  return (
    <>
      <g className={a.card}>
        <rect className={a.ink} x="20" y="40" width="98" height="64" rx="10" />
        <rect className={a.inkD} x="20" y="54" width="98" height="10" />
        <rect className={a.accM} x="32" y="74" width="18" height="13" rx="3" />
        <rect className={a.inkL} x="58" y="80" width="44" height="4" rx="2" />
      </g>
      {rows.map(([y, w, off], i) => (
        <rect key={i} className={`${a.row} ${a.inkL}`} x={216 - w} y={y} width={w} height="6" rx="3" style={{ ['--dx' as string]: `${off}px`, ['--i' as string]: i }} />
      ))}
      <rect className={a.inkD} x="140" y="92" width="76" height="2" rx="1" />
      <rect className={`${a.total} ${a.acc}`} x="146" y="100" width="70" height="7" rx="3.5" />
      <path className={`${a.draw} ${a.check}`} d="M222 103l5 5 9-11" pathLength={1} />
    </>
  );
}

function Templates() {
  const slots: [number, number][] = [
    [84, 38],
    [150, 38],
    [84, 74],
    [150, 74],
  ];
  const from = ['-40px, -4px, -9deg', '-30px, 30px, 7deg', '-54px, 6px, -4deg', '-18px, 34px, 12deg'];
  return (
    <>
      <rect className={`${a.frame}`} x="72" y="28" width="150" height="86" rx="11" />
      {slots.map(([x, y], i) => (
        <rect key={i} className={a.slotLine} x={x} y={y} width="60" height="28" rx="5" />
      ))}
      {slots.map(([x, y], i) => {
        const [tx, ty, r] = from[i].split(', ');
        return (
          <g key={i} className={a.mod} style={{ ['--tx' as string]: tx, ['--ty' as string]: ty, ['--r' as string]: r, ['--i' as string]: i }}>
            <rect className={i === 0 ? a.acc : a.ink} x={x} y={y} width="60" height="28" rx="5" />
            <rect className={i === 0 ? a.paper : a.accM} x={x + 8} y={y + 9} width={i % 2 ? 22 : 30} height="4" rx="2" />
            <rect className={i === 0 ? a.paper : a.inkL} x={x + 8} y={y + 17} width={i % 2 ? 34 : 18} height="3" rx="1.5" />
          </g>
        );
      })}
    </>
  );
}

function Triggers() {
  return (
    <>
      <path className={a.wire} d="M56 78H104M136 78H182" />
      <path className={a.faint} d="M120 94V120" strokeDasharray="2 5" />
      <circle className={`${a.trig} ${a.acc2M}`} cx="40" cy="78" r="15" />
      <path className={a.paper} d="M41 69 35 80h6l-2 8 7-11h-6z" />
      <rect className={`${a.cond} ${a.inkL}`} x="108" y="66" width="24" height="24" rx="4" />
      <rect className={`${a.out} ${a.ink}`} x="184" y="64" width="30" height="28" rx="7" />
      <rect className={a.inkD} x="192" y="74" width="14" height="3" rx="1.5" />
      <rect className={a.inkD} x="192" y="80" width="9" height="3" rx="1.5" />
      <circle className={`${a.sig} ${a.acc2}`} cx="0" cy="0" r="4.5" />
    </>
  );
}

function Apis() {
  return (
    <>
      <path className={a.faint} d="M56 92C56 118 184 118 184 92" strokeDasharray="2 6" />
      <path className={`${a.flow} ${a.accS}`} d="M56 92C56 118 184 118 184 92" />
      <g className={a.portL}>
        <rect className={a.ink} x="20" y="46" width="70" height="46" rx="9" />
        <rect className={a.inkD} x="30" y="58" width="30" height="4" rx="2" />
        <rect className={a.inkD} x="30" y="68" width="20" height="4" rx="2" />
        {[56, 67, 78].map((y) => (
          <rect key={y} className={a.accM} x="90" y={y - 2} width="14" height="5" rx="1.5" />
        ))}
      </g>
      <g className={a.portR}>
        <rect className={a.ink} x="150" y="46" width="70" height="46" rx="9" />
        {[56, 67, 78].map((y) => (
          <rect key={y} className={a.inkD} x="150" y={y - 3} width="8" height="7" rx="1.5" />
        ))}
        <circle className={`${a.led} ${a.inkL}`} cx="206" cy="58" r="3.5" />
        <rect className={a.inkD} x="172" y="72" width="34" height="4" rx="2" />
      </g>
    </>
  );
}

/** an isometric block: top, left and right faces */
function Block({ x, y, s = 1, top }: { x: number; y: number; s?: number; top: string }) {
  const w = 22 * s;
  const h = 12 * s;
  const d = 22 * s;
  return (
    <g transform={`translate(${x} ${y})`}>
      <path className={top} d={`M0 ${-h}L${w} 0 0 ${h}${-w} 0z`} />
      <path className={a.inkL} d={`M${-w} 0 0 ${h}V${h + d}L${-w} ${d}z`} />
      <path className={a.ink} d={`M${w} 0 0 ${h}V${h + d}L${w} ${d}z`} />
    </g>
  );
}

function Web3() {
  const at: [number, number, string][] = [
    [42, 68, '-6px, 10px'],
    [94, 50, '4px, -8px'],
    [146, 68, '-4px, 12px'],
  ];
  return (
    <>
      <path className={a.faint} d="M42 74 94 56 146 74 198 56" strokeDasharray="2 5" />
      <path className={`${a.draw} ${a.accS}`} d="M42 74 94 56 146 74 198 56" pathLength={1} />
      {at.map(([x, y, off], i) => (
        <g key={i} className={a.blk} style={{ ['--o' as string]: off, ['--i' as string]: i }}>
          <Block x={x} y={y} top={`${a.blkTop}`} />
        </g>
      ))}
      <g className={a.drop}>
        <Block x={198} y={50} top={a.acc} />
      </g>
    </>
  );
}

function Hackathons() {
  const ms = [28, 92, 156];
  return (
    <>
      <path className={a.track} d="M28 96H210" />
      <path className={`${a.prog} ${a.accS}`} d="M28 96H210" pathLength={1} />
      <rect className={`${a.ms} ${a.acc}`} x={ms[0] - 9} y="87" width="18" height="18" rx="4" style={{ ['--i' as string]: 0 }} />
      <circle className={`${a.ms} ${a.acc}`} cx={ms[1]} cy="96" r="9.5" style={{ ['--i' as string]: 1 }} />
      <rect className={`${a.ms} ${a.acc}`} x={ms[2] - 8} y="88" width="16" height="16" rx="3" transform={`rotate(45 ${ms[2]} 96)`} style={{ ['--i' as string]: 2 }} />
      <rect className={a.inkL} x="209" y="56" width="3.5" height="50" rx="1.75" />
      <path className={`${a.flag} ${a.acc}`} d="M212.5 58H238l-7 9 7 9h-25.5z" />
      <g className={a.brief}>
        <rect className={a.ink} x="22" y="30" width="56" height="40" rx="6" />
        <rect className={a.accM} x="30" y="38" width="22" height="4" rx="2" />
        <rect className={a.inkD} x="30" y="47" width="38" height="3.5" rx="1.75" />
        <rect className={a.inkD} x="30" y="55" width="30" height="3.5" rx="1.75" />
      </g>
    </>
  );
}

function Desktop() {
  return (
    <>
      <rect className={`${a.dock} ${a.inkD}`} x="66" y="112" width="120" height="14" rx="5" />
      <g className={a.winA}>
        <rect className={a.ink} x="36" y="30" width="124" height="80" rx="8" />
        <rect className={a.inkL} x="36" y="30" width="124" height="15" rx="7" />
        {[46, 55, 64].map((x) => (
          <circle key={x} className={a.inkD} cx={x} cy="37.5" r="2.6" />
        ))}
        <rect className={a.inkD} x="46" y="56" width="58" height="5" rx="2.5" />
        <rect className={a.inkD} x="46" y="67" width="40" height="5" rx="2.5" />
      </g>
      <g className={a.winB}>
        <rect className={a.ink} x="86" y="48" width="124" height="80" rx="8" />
        <rect className={a.accM} x="86" y="48" width="124" height="15" rx="7" />
        {[96, 105, 114].map((x) => (
          <circle key={x} className={a.paper} cx={x} cy="55.5" r="2.6" />
        ))}
        <rect className={`${a.pane} ${a.acc}`} x="96" y="74" width="34" height="34" rx="4" />
        <rect className={a.inkL} x="138" y="76" width="60" height="5" rx="2.5" />
        <rect className={a.inkD} x="138" y="87" width="44" height="5" rx="2.5" />
      </g>
    </>
  );
}

function Infra() {
  return (
    <>
      <path className={a.faint} d="M60 76H96M146 76H180" strokeDasharray="3 5" />
      <path className={`${a.draw} ${a.accS}`} d="M60 76H96M146 76H180" pathLength={1} />
      <circle className={a.ink} cx="40" cy="76" r="20" />
      <ellipse className={a.globe} cx="40" cy="76" rx="9" ry="20" />
      <path className={a.globe} d="M20 76H60M24 65H56M24 87H56" />
      {[56, 70, 84].map((y, i) => (
        <g key={y}>
          <rect className={a.ink} x="96" y={y} width="50" height="12" rx="3.5" />
          <circle className={`${a.ledS} ${a.inkL}`} cx="104" cy={y + 6} r="2.5" style={{ ['--i' as string]: i }} />
          <rect className={a.inkD} x="112" y={y + 4.5} width="26" height="3" rx="1.5" />
        </g>
      ))}
      <path className={`${a.shackle} ${a.inkStroke}`} d="M188 70V61a9 9 0 0 1 18 0v9" />
      <rect className={`${a.lock} ${a.inkL}`} x="182" y="68" width="30" height="26" rx="6" />
      <circle className={a.inkD} cx="197" cy="80" r="3" />
      <circle className={`${a.verify} ${a.acc}`} cx="0" cy="0" r="4" />
    </>
  );
}

function Ops() {
  const beat = 'M30 86H84L94 64 104 104 114 72 122 86H210';
  return (
    <>
      <rect className={a.inkD} x="18" y="26" width="204" height="100" rx="11" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect className={a.ink} x={150 + i * 22} y="36" width="18" height="10" rx="5" />
          <circle className={`${a.svc} ${a.inkL}`} cx={155 + i * 22} cy="41" r="2.6" style={{ ['--i' as string]: i }} />
        </g>
      ))}
      <rect className={a.ink} x="30" y="37" width="44" height="7" rx="3.5" />
      <path className={a.faint} d={beat} />
      <path className={`${a.pulse} ${a.accS}`} d={beat} pathLength={1} />
    </>
  );
}

const ART: Record<CapabilityId, () => JSX.Element> = {
  travel: Travel,
  mail: Mail,
  crm: Crm,
  payments: Payments,
  templates: Templates,
  triggers: Triggers,
  apis: Apis,
  web3: Web3,
  hackathons: Hackathons,
  desktop: Desktop,
  infra: Infra,
  ops: Ops,
};

export function Art({ id }: { id: CapabilityId }) {
  const Piece = ART[id];
  return (
    <svg className={a.art} data-art={id} viewBox="0 0 240 120" aria-hidden="true" focusable="false">
      <Piece />
    </svg>
  );
}
