import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Project } from '@/lib/api';

const TYPE_ICONS: Record<string, string> = {
  video: '🎬',
  website: '🖥️',
  app: '💻',
  game: '🎮',
  research: '📚',
  automation: '🤖',
};

interface ProjectCardProps {
  project: Project;
  listView?: boolean;
}

export function ProjectCard({ project, listView }: ProjectCardProps) {
  const icon = TYPE_ICONS[project.type] ?? '📁';
  const statusColor =
    project.status === 'completed' ? 'text-blue-400 bg-blue-500/10' : 'text-amber-400 bg-amber-500/10';

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className={`block rounded-xl border border-[var(--card-border)] bg-[var(--card)] hover:border-violet-500/50 transition-all hover:shadow-lg hover:shadow-violet-500/5 ${
        listView ? 'p-4 flex items-center gap-4' : 'p-4'
      }`}
    >
      {listView ? (
        <>
          <span className="text-2xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{project.name}</h3>
            <p className="text-xs text-[var(--muted)] capitalize">{project.type}</p>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
              {project.status.replace('_', ' ')}
            </span>
            <p className="text-xs text-[var(--muted)] mt-1">
              {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-2xl">{icon}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
              {project.status.replace('_', ' ')}
            </span>
          </div>
          <h3 className="font-medium truncate">{project.name}</h3>
          <div className="flex items-center justify-between mt-2 text-xs text-[var(--muted)]">
            <span className="capitalize">{project.type}</span>
            <span>{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
          </div>
        </>
      )}
    </Link>
  );
}
