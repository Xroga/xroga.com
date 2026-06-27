import { SwarmRunHistory } from '@/components/dashboard/SwarmRunHistory';
import { MessageSquare } from 'lucide-react';

export default function ChatsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="w-7 h-7 text-[var(--accent)]" />
          Swarm History
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Past commands and results from your AI Swarm runs — continue any task from here.
        </p>
      </div>
      <div className="glass-panel rounded-2xl overflow-hidden">
        <SwarmRunHistory />
      </div>
    </div>
  );
}
