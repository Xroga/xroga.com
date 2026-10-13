/** Plain-language state for an employee's conversation, shared by the selector row and the chat header. */
import type { EmployeeId, ThreadState } from './team';
import type { Thread } from './workforce';

const STATE_LABEL: Record<ThreadState, string> = {
  ready: 'Ready to assign',
  thinking: 'Replying…',
  working: 'Working on it',
  waiting: 'Waiting for you',
  report: 'Report ready',
  decision: 'Needs your decision',
  blocked: 'Asked you first',
};

/** After the job is assigned, "waiting" means waiting for its schedule or trigger, not for the visitor. */
export const stateLabel = (id: EmployeeId, t: Thread) =>
  t.state === 'waiting' && t.msgs.length > 2 ? (id === 'intake' ? 'Waiting for a booking' : 'Scheduled') : STATE_LABEL[t.state];
