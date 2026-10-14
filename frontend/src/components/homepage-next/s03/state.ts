/** S03 local state: one fictional launch explored as a four-step journey. Pure reducer; nothing leaves the page. */
import { AUDIENCES, OPPORTUNITIES, SOURCES, type AssetId, type AudienceId, type Channel, type OpportunityId, type Perspective, type ToolId } from './data';

/** The one on-demand detail open over a step, if any. */
export type Detail = 'about' | 'evidence' | 'approvals' | 'method' | null;

export interface State {
  p: Perspective;
  asset: AssetId;
  opp: OpportunityId;
  audience: AudienceId;
  channel: Channel;
  ready: boolean; // marked ready for review in this preview only
  source: string;
  detail: Detail;
  tool: ToolId | null;
}

export type Action =
  | { type: 'p'; p: Perspective }
  | { type: 'asset'; id: AssetId }
  | { type: 'opp'; id: OpportunityId }
  | { type: 'audience'; id: AudienceId }
  | { type: 'channel'; id: Channel }
  | { type: 'ready' }
  | { type: 'source'; id: string }
  | { type: 'detail'; detail: Detail }
  | { type: 'tool'; id: ToolId | null }
  | { type: 'reset' }
  | { type: 'escape' };

export const initialState = (): State => ({
  p: 'launch',
  asset: 'page',
  opp: OPPORTUNITIES[0].id,
  audience: AUDIENCES[0].id,
  channel: 'social',
  ready: false,
  source: SOURCES[0].id,
  detail: null,
  tool: null,
});

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'p':
      // steps keep every selection; switching never replays anything
      return { ...s, p: a.p, detail: s.detail === 'about' ? 'about' : null };
    case 'asset':
      return { ...s, asset: a.id };
    case 'opp':
      return { ...s, opp: a.id, detail: s.detail === 'evidence' ? 'evidence' : s.detail };
    case 'audience':
      return { ...s, audience: a.id };
    case 'channel':
      return { ...s, channel: a.id };
    case 'ready':
      // a preview decision only: nothing is published, sent or spent
      return { ...s, ready: !s.ready };
    case 'source':
      return { ...s, source: a.id };
    case 'detail':
      return { ...s, detail: a.detail };
    case 'tool':
      return { ...s, tool: a.id };
    case 'reset':
      return initialState();
    case 'escape':
      if (s.detail) return { ...s, detail: null };
      if (s.tool) return { ...s, tool: null };
      return s;
  }
}

export const isDefault = (s: State) => {
  const d = initialState();
  return (Object.keys(d) as (keyof State)[]).every((k) => k === 'tool' || k === 'detail' || s[k] === d[k]);
};
