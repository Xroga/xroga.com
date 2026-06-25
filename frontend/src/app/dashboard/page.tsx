import { createClient } from '@/lib/supabase/server';
import { ActionMeter } from '@/components/ActionMeter';
import { SwarmChat } from '@/components/SwarmChat';
import { Code2, Film, Globe, Bot } from 'lucide-react';
import Link from 'next/link';

const quickActions = [
  { label: 'Build App', icon: Code2, href: '/dashboard/projects?type=app' },
  { label: 'Make Movie', icon: Film, href: '/dashboard/projects?type=video' },
  { label: 'Build Website', icon: Globe, href: '/dashboard/projects?type=website' },
  { label: 'Automate', icon: Bot, href: '/dashboard/projects?type=automation' },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user!.id)
    .single();

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user!.id)
    .order('updated_at', { ascending: false })
    .limit(6);

  const name = profile?.display_name ?? user?.email?.split('@')[0] ?? 'there';

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {name}</h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Your AI Swarm is ready. Describe any task below.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SwarmChat />

          <div>
            <h2 className="font-semibold mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map(({ label, icon: Icon, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)] hover:border-violet-500/50 transition-colors"
                >
                  <Icon className="w-5 h-5 text-violet-400" />
                  <span className="text-xs">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <ActionMeter />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Recent Projects</h2>
          <Link href="/dashboard/projects" className="text-sm text-violet-400 hover:underline">
            View all
          </Link>
        </div>

        {projects && projects.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)] hover:border-violet-500/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 capitalize">
                    {project.type}
                  </span>
                  <span className={`text-xs ${project.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {project.status === 'completed' ? '✅' : '🔄'} {project.status.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="font-medium truncate">{project.name}</h3>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {project.actions_used} actions used
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 rounded-xl border border-dashed border-[var(--card-border)]">
            <p className="text-[var(--muted)] text-sm">No projects yet. Use the command bar above to create your first one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
