'use client';

import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from 'lucide-react';

import {
  useLiveBuildStore,
} from '@/store/useLiveBuildStore';

function icon(
  status:
    string,
) {
  if (
    status ===
    'success'
  ) {
    return (
      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
    );
  }

  if (
    status ===
    'failed'
  ) {
    return (
      <XCircle className="h-3 w-3 text-rose-500" />
    );
  }

  if (
    status ===
    'running'
  ) {
    return (
      <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />
    );
  }

  return (
    <Circle className="h-3 w-3 text-[var(--muted)]" />
  );
}

export function LiveBuildTimeline() {
  const timeline =
    useLiveBuildStore(
      (
        state,
      ) =>
        state.timeline,
    );

  if (
    !timeline.length
  ) {
    return null;
  }

  const items =
    timeline.slice(
      -10,
    );

  return (
    <div className="border-b border-[var(--card-border)]/40 bg-[var(--card)]/40 px-3 py-2">
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
        Live build
      </p>

      <div className="space-y-1">
        {items.map(
          (
            item,
          ) => (
            <div
              key={item.id}
              className="flex items-start gap-2 text-[10px]"
            >
              <span className="mt-0.5 shrink-0">
                {icon(
                  item.status,
                )}
              </span>

              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--foreground)]/85">
                  {item.title}
                </p>

                {item.summary ? (
                  <p className="truncate text-[var(--muted)]">
                    {item.summary}
                  </p>
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
