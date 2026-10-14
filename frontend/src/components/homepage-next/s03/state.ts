/** S03 local state: one sample shop explored through three worlds. Pure reducer; nothing leaves the page. */
import { AUDIENCES, CHANNELS, QUERIES, SOURCES, type Channel, type Lens, type ToolId, type World } from './data';

/** The one on-demand layer open over a world, if any. */
export type Layer = 'evidence' | 'compare' | 'preview' | 'method' | null;

export interface State {
  world: World;
  query: string;
  lens: Lens;
  audience: string;
  channel: Channel;
  approved: boolean;
  source: string;
  layer: Layer;
  tool: ToolId | null;
}

export type Action =
  | { type: 'world'; world: World }
  | { type: 'query'; id: string }
  | { type: 'next-query' }
  | { type: 'lens'; lens: Lens }
  | { type: 'layer'; layer: Layer }
  | { type: 'audience'; id: string }
  | { type: 'channel'; id: Channel }
  | { type: 'approve' }
  | { type: 'source'; id: string }
  | { type: 'tool'; id: ToolId | null }
  | { type: 'reset' }
  | { type: 'escape' };

export const initialState = (): State => ({
  world: 'discover',
  query: QUERIES[0].id,
  lens: 'organic',
  audience: AUDIENCES[0].id,
  channel: CHANNELS[0].id,
  approved: false,
  source: SOURCES[0].id,
  layer: null,
  tool: null,
});

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'world':
      // worlds keep every selection; switching never replays anything
      return { ...s, world: a.world, layer: null };
    case 'query':
      return { ...s, world: 'discover', query: a.id, layer: s.layer === 'compare' ? 'compare' : null };
    case 'next-query': {
      const i = QUERIES.findIndex((q) => q.id === s.query);
      return { ...s, world: 'discover', query: QUERIES[(i + 1) % QUERIES.length].id, layer: null };
    }
    case 'lens':
      return { ...s, lens: a.lens };
    case 'layer':
      return { ...s, layer: a.layer };
    case 'audience':
      return { ...s, audience: a.id };
    case 'channel':
      return { ...s, channel: a.id };
    case 'approve':
      // a preview decision only: nothing is published, sent or spent
      return { ...s, approved: !s.approved };
    case 'source':
      return { ...s, source: a.id };
    case 'tool':
      return { ...s, tool: a.id };
    case 'reset':
      return initialState();
    case 'escape':
      if (s.layer) return { ...s, layer: null };
      if (s.tool) return { ...s, tool: null };
      return s;
  }
}

export const isDefault = (s: State) => {
  const d = initialState();
  return (Object.keys(d) as (keyof State)[]).every((k) => k === 'tool' || s[k] === d[k]);
};
