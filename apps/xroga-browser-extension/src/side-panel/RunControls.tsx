// Pause gives control back to the user without cancelling the canonical task. Resume is always explicit.
import type { QueuedMessage, RunStatus } from '@src/store/types';
import { t } from '@src/ui/i18n';

const button =
  'rounded-lg border border-nb-border bg-nb-bg px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:border-nb-accent/40 hover:bg-nb-surface';

export function RunBar({
  status,
  reason,
  onContinue,
  onResume,
  onPause,
  onStop,
}: {
  status: RunStatus;
  reason?: string;
  onContinue: () => void;
  onResume: () => void;
  onPause?: () => void;
  onStop?: () => void;
}) {
  if (onPause && status === 'running') {
    return (
      <Bar text="Xroga is working in Chrome.">
        <button type="button" className={button} onClick={onPause}>
          Pause and take over
        </button>
      </Bar>
    );
  }
  if (status === 'capped') {
    return (
      <Bar text={t('run.capped')}>
        <button type="button" className={button} onClick={onContinue}>
          {t('run.continue')}
        </button>
        {onStop && (
          <button type="button" className={button} onClick={onStop}>
            Stop
          </button>
        )}
      </Bar>
    );
  }
  if (status === 'interrupted') {
    return (
      <Bar text={onPause ? (reason ?? 'Task paused. Review the page before continuing.') : t('run.interrupted')}>
        <button type="button" className={button} onClick={onResume}>
          {t('run.resume')}
        </button>
        {onStop && (
          <button type="button" className={button} onClick={onStop}>
            Stop
          </button>
        )}
      </Bar>
    );
  }
  return null;
}

function Bar({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="mx-2 flex items-center gap-2 rounded-xl border border-nb-accent/15 bg-nb-surface px-3 py-1.5 text-xs">
      <span className="flex-1">{text}</span>
      {children}
    </div>
  );
}

export function QueueList({
  items,
  onEdit,
  onDelete,
}: {
  items: QueuedMessage[];
  onEdit: (item: QueuedMessage) => void;
  onDelete: (item: QueuedMessage) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mx-2 flex flex-col gap-1 rounded-xl border border-dashed border-nb-border bg-nb-bg/60 p-2 text-xs">
      <span className="text-nb-muted">{t('queue.title')}</span>
      {items.map(item => (
        <div key={item.id} className="flex items-start gap-2">
          <span className="flex-1 whitespace-pre-wrap">{item.text}</span>
          <button type="button" className="text-nb-link underline" onClick={() => onEdit(item)}>
            {t('queue.edit')}
          </button>
          <button type="button" className="text-nb-link underline" onClick={() => onDelete(item)}>
            {t('queue.delete')}
          </button>
        </div>
      ))}
    </div>
  );
}
