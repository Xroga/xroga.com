// The run's plan as a checklist. Every state comes from the loop (observed results and verified checks), never from the model's own words:
// verified = the milestone's check was seen on the page; reported = the model says it is done and nothing independent confirms it.
import type { ToolRow } from '@src/ui/protocol';
import type { Milestone, MilestoneStatus, PlanSnapshot } from '@src/agent/task-plan';

const LABEL: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  working: 'Working',
  verified: 'Completed and verified',
  reported: 'Reported done, not verified',
  recovering: 'Recovering',
  waiting: 'Waiting for you',
  blocked: 'Blocked',
};

const GLYPH: Record<MilestoneStatus, string> = { pending: '○', working: '◐', verified: '✓', reported: '✓?', recovering: '↻', waiting: '⏸', blocked: '✕' };

/** The newest plan in a run's rows, or undefined when the run has none (a simple task shows no checklist). */
export function latestPlan(rows: ToolRow[]): PlanSnapshot | undefined {
  for (const row of [...rows].reverse()) {
    if (row.tool !== 'plan') continue;
    const plan = (row.result as { data?: { plan?: PlanSnapshot } } | undefined)?.data?.plan;
    if (plan && Array.isArray(plan.milestones) && plan.milestones.length) return plan;
  }
  return undefined;
}

function Item({ m }: { m: Milestone }) {
  const tone =
    m.status === 'verified' ? 'text-green-700 dark:text-green-400'
    : m.status === 'recovering' || m.status === 'blocked' ? 'text-amber-700 dark:text-amber-400'
    : m.status === 'pending' ? 'opacity-60' : '';
  return (
    <li className={`flex items-start gap-2 ${tone}`} data-status={m.status}>
      <span aria-hidden="true" className="w-5 shrink-0 text-center">{GLYPH[m.status]}</span>
      <span className="min-w-0">
        <span className={m.status === 'working' || m.status === 'recovering' ? 'font-medium' : ''}>{m.title}</span>
        <span className="sr-only">{`: ${LABEL[m.status]}`}</span>
        {m.status === 'recovering' || m.status === 'waiting' || m.status === 'blocked' || m.status === 'reported' ? <span className="ml-1 text-xs opacity-80">{`(${LABEL[m.status].toLowerCase()})`}</span> : null}
        {m.note ? <span className="block text-xs opacity-70">{m.note}</span> : null}
      </span>
    </li>
  );
}

export function PlanChecklist({ plan }: { plan: PlanSnapshot }) {
  const done = plan.milestones.filter(m => m.status === 'verified' || m.status === 'reported').length;
  return (
    <section aria-label="Task plan" data-role="plan" className="rounded border border-black/10 p-2 text-sm dark:border-white/15">
      <div className="mb-1 text-xs font-medium opacity-70">{`Plan · ${done} of ${plan.milestones.length}`}</div>
      <ol className="flex flex-col gap-1">
        {plan.milestones.map(m => <Item key={m.id} m={m} />)}
      </ol>
    </section>
  );
}
