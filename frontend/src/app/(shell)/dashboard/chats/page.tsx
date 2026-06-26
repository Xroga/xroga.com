import { SwarmRunHistory } from '@/components/dashboard/SwarmRunHistory';

export default function ChatsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-terminal">Swarm History</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Past commands and results from your AI Swarm runs.
        </p>
      </div>
      <SwarmRunHistory />
    </div>
  );
}
