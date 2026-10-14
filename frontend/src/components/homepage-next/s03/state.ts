/** S03 local state: one canonical selection drives every surface in both chapters. Pure reducer; nothing leaves the page. */
import {
  BUDGET,
  CHANNELS,
  LINK_MODES,
  QUERIES,
  SOURCES,
  type AdGroup,
  type Audience,
  type IssueId,
  type LaunchAsset,
  type Lens,
  type LinkMode,
  type Mission,
  type Placement,
  type ToolId,
} from './data';

export type Chapter = 'search' | 'growth';

export interface State {
  view: Chapter; // the selected mode
  // A · search
  lens: Lens;
  issue: IssueId;
  crawl: number; // increments each time "Inspect crawl" runs; the tracer plays once per run
  repair: boolean; // proposed repair preview shown (never applied)
  query: string;
  brief: boolean;
  sample: string;
  aiFix: boolean;
  mode: LinkMode;
  source: string;
  outreach: boolean; // outreach draft open (a draft, never a link)
  localFix: boolean;
  // B · growth
  mission: Mission;
  asset: LaunchAsset;
  group: AdGroup;
  excluded: boolean; // irrelevant searches moved out as negatives
  budget: number; // proposed daily cap, never spend
  radius: number;
  audience: Audience;
  placement: Placement;
  channel: string;
  // shared
  tool: { chapter: Chapter; id: ToolId } | null;
  detail: 'evidence' | 'method' | 'review' | null; // one on-demand detail at a time
  sheet: Chapter | null; // phone evidence sheet
  about: boolean;
}

export type Action =
  | { type: 'set'; patch: Partial<State> }
  | { type: 'view'; view: Chapter }
  | { type: 'lens'; lens: Lens }
  | { type: 'mission'; mission: Mission }
  | { type: 'mode'; mode: LinkMode }
  | { type: 'crawl' }
  | { type: 'tool'; chapter: Chapter; id: ToolId | null }
  | { type: 'escape' }
  | { type: 'reset'; chapter: Chapter };

const searchDefaults = () => ({
  lens: 'links' as Lens,
  issue: 'broken' as IssueId,
  crawl: 0,
  repair: false,
  query: QUERIES[1].id,
  brief: false,
  sample: 'today',
  aiFix: false,
  mode: 'gap' as LinkMode,
  source: 'guide',
  outreach: false,
  localFix: false,
});
const growthDefaults = () => ({
  mission: 'search' as Mission,
  asset: 'page' as LaunchAsset,
  group: 'subscription' as AdGroup,
  excluded: false,
  budget: BUDGET.initial,
  radius: 0,
  audience: 'new' as Audience,
  placement: 'feed' as Placement,
  channel: CHANNELS[0].id,
});

export const initialState = (): State => ({ view: 'search', ...searchDefaults(), ...growthDefaults(), tool: null, detail: null, sheet: null, about: false });

/** the first source a link mode shows: switching modes never leaves a hidden source selected */
export const visibleIn = (mode: LinkMode) => SOURCES.filter((s) => LINK_MODES.find((m) => m.id === mode)!.show.includes(s.cls));

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set':
      return { ...s, ...a.patch };
    case 'view':
      // modes keep every selection inside them; only the shared layers close
      return { ...s, view: a.view, detail: null, tool: null, sheet: null };
    case 'lens':
      // lenses keep every selection; details and provider notes belong to the lens they were opened in
      return { ...s, lens: a.lens, detail: null, tool: s.tool?.chapter === 'search' ? null : s.tool };
    case 'mission':
      return { ...s, mission: a.mission, detail: null, tool: s.tool?.chapter === 'growth' ? null : s.tool };
    case 'mode': {
      const shown = visibleIn(a.mode);
      const keep = shown.some((x) => x.id === s.source);
      const pick = a.mode === 'mentions' ? shown.find((x) => x.cls === 'mention') : a.mode === 'gap' ? shown.find((x) => x.cls === 'rival') : undefined;
      return { ...s, mode: a.mode, source: keep && !pick ? s.source : (pick ?? shown[0]).id, outreach: a.mode === 'outreach' ? s.outreach : false };
    }
    case 'crawl':
      return { ...s, crawl: s.crawl + 1 };
    case 'tool':
      return { ...s, tool: a.id ? { chapter: a.chapter, id: a.id } : null };
    case 'escape':
      if (s.tool) return { ...s, tool: null };
      if (s.sheet) return { ...s, sheet: null };
      if (s.detail) return { ...s, detail: null };
      if (s.about) return { ...s, about: false };
      return s;
    case 'reset':
      return { ...s, ...(a.chapter === 'search' ? searchDefaults() : growthDefaults()), tool: null, detail: null, sheet: null };
  }
}

const SEARCH_KEYS = Object.keys(searchDefaults()) as (keyof State)[];
const GROWTH_KEYS = Object.keys(growthDefaults()) as (keyof State)[];
export const isDefault = (s: State, chapter: Chapter) => {
  const d = initialState();
  return (chapter === 'search' ? SEARCH_KEYS : GROWTH_KEYS).every((k) => k === 'crawl' || s[k] === d[k]);
};
