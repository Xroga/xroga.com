import Link from 'next/link';
import { GAME_STACKS } from '@/lib/gameBuilderContent';
import { HudIcon } from './HudIcons';

/**
 * Supported engines, as loadout modules.
 *
 * The engine list, the descriptions and the non-affiliation line all come from
 * `gameBuilderContent.ts` rather than being restated here — that copy was written to
 * name engines as targets a builder can ask for, and it must keep exactly one
 * source. "Custom stack" is the existing "HTML Canvas" entry, which is the
 * no-dependency option, so nothing new is claimed.
 *
 * The marks are original abstract glyphs, not engine logos: the repository has no
 * licensed logo assets for these projects, and using their trademarks to decorate a
 * commercial page would imply an endorsement the copy explicitly disclaims.
 */
const MARKS = ['cube', 'world', 'combat', 'ui', 'progression', 'code'] as const;

export function EngineLoadout() {
  return (
    <section className="xv-gc-panel xv-gc-engines" aria-labelledby="gc-engines-title">
      <header className="xv-gc-panel__head">
        <h2 className="xv-gc-panel__title" id="gc-engines-title">
          <span className="xv-gc-panel__index">4.</span> Build with the tools you love
        </h2>
        <Link href="/docs" className="xv-gc-link">
          More engines
          <HudIcon name="arrow" size={12} />
        </Link>
      </header>

      <ul className="xv-gc-engines__row">
        {GAME_STACKS.map((stack, index) => (
          <li key={stack.name} className="xv-gc-engine">
            <span className="xv-gc-engine__mark" aria-hidden="true">
              <HudIcon name={MARKS[index % MARKS.length]} size={22} />
            </span>
            <span className="xv-gc-engine__name">{stack.name}</span>
            <span className="xv-gc-engine__kind">{stack.kind}</span>
          </li>
        ))}
      </ul>

      <p className="xv-gc-note">{GAME_STACKS.length} targets shown. Xroga is not affiliated with or endorsed by these projects — they are named as targets you can ask for.</p>
    </section>
  );
}
