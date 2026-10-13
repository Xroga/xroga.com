/** S03 local state: one sample market explored through three views. Pure reducer; nothing leaves the page. */
import { AUDIENCES, QUERIES, SOURCES, type PaperMode, type ToolId, type View } from './data';

export interface State {
  view: View;
  query: string;
  paper: PaperMode;
  why: boolean;
  audience: string;
  approved: boolean;
  source: string;
  tool: ToolId | null;
}

export type Action =
  | { type: 'view'; view: View }
  | { type: 'query'; id: string }
  | { type: 'next-query' }
  | { type: 'paper'; mode: PaperMode }
  | { type: 'why'; open: boolean }
  | { type: 'audience'; id: string }
  | { type: 'approve' }
  | { type: 'source'; id: string }
  | { type: 'tool'; id: ToolId | null }
  | { type: 'reset' }
  | { type: 'escape' };

export const initialState = (): State => ({
  view: 'market',
  query: QUERIES[0].id,
  paper: 'organic',
  why: false,
  audience: AUDIENCES[0].id,
  approved: false,
  source: SOURCES[0].id,
  tool: null,
});

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'view':
      // views keep every selection; nothing replays
      return { ...s, view: a.view };
    case 'query':
      // a new search keeps the chosen lens (organic or AI answer) but closes detail panels
      return {
        ...s,
        view: 'market',
        query: a.id,
        paper: s.paper === 'ai' ? 'ai' : 'organic',
        why: false,
      };
    case 'next-query': {
      const i = QUERIES.findIndex((q) => q.id === s.query);
      return {
        ...s,
        view: 'market',
        query: QUERIES[(i + 1) % QUERIES.length].id,
        paper: 'organic',
        why: false,
      };
    }
    case 'paper':
      return { ...s, view: 'market', paper: a.mode };
    case 'why':
      return { ...s, why: a.open };
    case 'audience':
      return { ...s, audience: a.id };
    case 'approve':
      // a preview decision only: nothing is published, sent or spent
      return { ...s, approved: !s.approved };
    case 'source':
      return { ...s, source: a.id };
    case 'tool':
      return { ...s, tool: a.id };
    case 'reset':
      return { ...initialState(), tool: null };
    case 'escape':
      if (s.tool) return { ...s, tool: null };
      if (s.why) return { ...s, why: false };
      if (s.paper !== 'organic') return { ...s, paper: 'organic' };
      return s;
  }
}

export const isDefault = (s: State) => {
  const d = initialState();
  return s.view === d.view && s.query === d.query && s.paper === d.paper && !s.why && s.audience === d.audience && !s.approved && s.source === d.source;
};

/** Changes whenever the X trace should re-draw. */
export const traceKey = (s: State) => `${s.view}:${s.query}:${s.paper}:${s.audience}:${s.source}:${s.why ? 1 : 0}`;
