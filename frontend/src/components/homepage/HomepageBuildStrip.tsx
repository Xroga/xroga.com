import Link from 'next/link';
import { CODING_LANGUAGES } from '@/lib/codingLanguages';
import {
  AppWindow,
  Bot,
  ChevronRight,
  Cloud,
  CodeXml,
  Globe,
  LayoutGrid,
  Monitor,
  Puzzle,
  Smartphone,
  TabletSmartphone,
} from 'lucide-react';

/**
 * The capability deck inside the homepage ownership story.
 *
 * This content used to sit directly under the hero composer. It now belongs beside the
 * explanation of what Xroga actually produces, where the range reads as product context
 * instead of a second navigation bar competing with the primary prompt.
 *
 * On the platform marks: the reference renders the Apple, Chrome and Android logos.
 * Those are third-party trademarks, and Apple's guidelines in particular do not permit
 * reproduction by others without written permission — so the glyphs here are neutral and
 * the platform is named in the label instead, which is the part that actually carries
 * the information and is unambiguously fair to use. Swapping in the real marks is a
 * question of holding the rights, not of CSS.
 *
 * The panel keeps its own blue in every theme rather than following the picker. It reads
 * as a single device rather than a page surface, which is how the reference works, and
 * its text sits on that blue rather than on the page ground.
 */

type Item = {
  icon: typeof LayoutGrid;
  /** Two lines where one would leave the column too wide. */
  label: string;
  /** The one entry that is a failure state rather than a thing to build. */
  warn?: boolean;
};

const ITEMS: ReadonlyArray<Item> = [
  { icon: LayoutGrid, label: 'Dashboards' },
  { icon: Monitor, label: 'Desktop\nsoftware' },
  { icon: AppWindow, label: 'Landing\npage' },
  { icon: Smartphone, label: 'Mobile\napp' },
  { icon: TabletSmartphone, label: 'iOS\napps' },
  { icon: Puzzle, label: 'Chrome\nextensions' },
  { icon: Bot, label: 'Android\napp' },
  { icon: CodeXml, label: 'Debug\nerror', warn: true },
  { icon: Globe, label: 'Website' },
  { icon: Cloud, label: 'SaaS\napp' },
] as const;

export function HomepageBuildStrip() {
  return (
    <div className="xv-hc-strip" role="group" aria-label="What Xroga can build and the languages it writes">
      <div className="xv-hc-strip__intro">
        <span>WHAT YOU CAN SHIP</span>
        <p>One workspace. From first brief to working product.</p>
      </div>

      <p className="xv-hc-strip__motto">
        Build. Launch.<br />{' '}Scale. <span>Repeat.</span>
      </p>

      <ul className="xv-hc-strip__list">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.label} className="xv-hc-strip__item" data-warn={item.warn ? 'true' : undefined}>
              <Icon className="xv-hc-strip__icon" aria-hidden="true" />
              {/* The label wraps at an authored point so the columns stay even; the
                  newline is a line break, not two separate words to a screen reader. */}
              <span className="xv-hc-strip__label">
                {item.label.split('\n').map((line, i) => (
                  <span key={line} className="xv-hc-strip__line">
                    {i > 0 ? ' ' : ''}{line}
                  </span>
                ))}
              </span>
              <span className="xv-hc-strip__glow" aria-hidden="true" />
            </li>
          );
        })}
      </ul>

      <Link href="/features" className="xv-hc-strip__more">
        <span>And<br />More</span>
        <ChevronRight aria-hidden="true" />
      </Link>

      <p className="xv-hc-strip__language-label">LANGUAGES XROGA WRITES</p>
      <ul className="xv-hc-strip__langs" aria-label="Languages Xroga writes">
        {CODING_LANGUAGES.map((lang) => (
          <li key={lang.title} className="xv-hc-strip__lang">
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ fill: lang.color }}>
              <path d={lang.path} />
            </svg>
            {lang.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
