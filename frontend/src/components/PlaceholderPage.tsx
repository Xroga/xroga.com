export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-[var(--muted)]">Coming in a future phase.</p>
    </div>
  );
}
