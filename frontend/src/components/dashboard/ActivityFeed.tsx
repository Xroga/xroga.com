'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Skeleton from 'react-loading-skeleton';
import { api, type ActivityLog } from '@/lib/api';
import 'react-loading-skeleton/dist/skeleton.css';

const ACTION_LABELS: Record<string, string> = {
  swarm_completed: 'Swarm task completed',
  swarm_failed: 'Swarm task failed',
  created_project: 'Created a new project',
  content_blocker_activated: 'Enabled content protection',
  generated_video: 'Generated a video',
  pushed_to_github: 'Pushed code to GitHub',
};

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.profile.activity()
      .then(setActivities)
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Skeleton height={200} baseColor="#1a1a2e" highlightColor="#2a2a3e" />;
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--card-border)]">
        <h2 className="font-semibold text-sm">Recent Activity</h2>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-[var(--card-border)]">
        {activities.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted)] text-center">No activity yet</p>
        ) : (
          activities.map((a) => (
            <div key={a.id} className="px-4 py-3 text-sm">
              <p>{ACTION_LABELS[a.action] ?? a.action.replace(/_/g, ' ')}</p>
              {a.projects?.name && (
                <p className="text-xs text-violet-400 mt-0.5">{a.projects.name}</p>
              )}
              <p className="text-xs text-[var(--muted)] mt-1">
                {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
