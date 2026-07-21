import type { Project, SwarmRunSummary } from '@/lib/api';
import type { MediaItem } from '@/lib/mediaStorage';
import type { UiverseTableRow } from '@/components/ui/UiverseTableCard';
import {
  type ItemMeta,
  splitDateParts,
  isActiveStatus,
  recentlyLabel,
  estimateTabs,
} from '@/lib/itemMeta';

export function projectTableRows(project: Project, meta: ItemMeta): UiverseTableRow[] {
  const updated = splitDateParts(project.updated_at);
  return [
    { left: 'name', right: project.name.slice(0, 28) },
    { left: 'type', right: project.type },
    { left: 'date', right: updated.date },
    { left: 'time', right: updated.time },
    { left: 'year', right: updated.year },
    { left: 'active', right: isActiveStatus(project.status) ? 'yes' : 'no' },
    { left: 'recently seen', right: recentlyLabel(meta.seenAt) },
    { left: 'recently updated', right: recentlyLabel(project.updated_at) },
    { left: 'recently deleted', right: recentlyLabel(meta.deletedAt) },
  ];
}

export function chatTableRows(run: SwarmRunSummary, meta: ItemMeta): UiverseTableRow[] {
  const created = splitDateParts(run.created_at);
  const nested = (run.output as { output?: Record<string, unknown> } | null)?.output;
  const fo = (nested ?? run.output) as
    | {
        fullyShipped?: boolean;
        handoffReady?: boolean;
        buildOk?: boolean;
        shipBlockers?: string[];
        shipOutcome?: { fullyShipped?: boolean; handoffReady?: boolean; buildOk?: boolean };
      }
    | null
    | undefined;
  const shipped = Boolean(fo?.shipOutcome?.fullyShipped ?? fo?.fullyShipped);
  const handoff = Boolean(fo?.shipOutcome?.handoffReady ?? fo?.handoffReady);
  const buildOk = fo?.shipOutcome?.buildOk ?? fo?.buildOk;
  const shipLabel = shipped
    ? 'shipped'
    : handoff
      ? 'handoff'
      : buildOk === false
        ? 'build failed'
        : fo?.shipBlockers?.length
          ? 'blocked'
          : '—';
  return [
    { left: 'prompt', right: run.prompt.slice(0, 32) + (run.prompt.length > 32 ? '…' : '') },
    { left: 'status', right: run.status },
    { left: 'ship', right: shipLabel },
    { left: 'date', right: created.date },
    { left: 'time', right: created.time },
    { left: 'year', right: created.year },
    { left: 'recently seen', right: recentlyLabel(meta.seenAt) },
  ];
}

export function automationTableRows(run: SwarmRunSummary, meta: ItemMeta): UiverseTableRow[] {
  const created = splitDateParts(run.created_at);
  const running = ['pending', 'planning', 'building', 'reviewing', 'testing', 'verifying'].includes(
    run.status
  );
  const tabs = meta.tabsUsed ?? estimateTabs(run.id, run.iteration_count);
  const runs = meta.runCount ?? run.iteration_count;
  return [
    { left: 'task', right: run.prompt.slice(0, 28) + (run.prompt.length > 28 ? '…' : '') },
    { left: 'date', right: created.date },
    { left: 'time', right: created.time },
    { left: 'year', right: created.year },
    { left: 'active', right: isActiveStatus(run.status) ? 'yes' : 'no' },
    { left: 'recently running', right: running ? 'now' : recentlyLabel(run.created_at) },
    { left: 'run count', right: String(runs) },
    { left: 'tabs used', right: String(tabs) },
    { left: 'recently seen', right: recentlyLabel(meta.seenAt) },
    { left: 'recently updated', right: recentlyLabel(run.completed_at ?? run.created_at) },
    { left: 'recently deleted', right: recentlyLabel(meta.deletedAt) },
  ];
}

export function mediaTableRows(item: MediaItem, meta: ItemMeta): UiverseTableRow[] {
  const created = splitDateParts(item.createdAt);
  return [
    { left: 'name', right: item.name.slice(0, 24) },
    { left: 'type', right: item.type },
    { left: 'date', right: created.date },
    { left: 'time', right: created.time },
    { left: 'year', right: created.year },
    { left: 'recently seen', right: recentlyLabel(meta.seenAt) },
  ];
}

export function actionCostRows(
  items: { task: string; cost: number }[],
  budgetLine?: (task: string, cost: number) => string
): UiverseTableRow[] {
  return items.map((item) => ({
    left: item.task,
    right: budgetLine ? budgetLine(item.task, item.cost) : String(item.cost),
  }));
}
