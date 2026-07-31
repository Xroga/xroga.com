export default function ShowcaseLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <p role="status" className="sr-only">
        Loading the Xroga AI Showcase
      </p>
      <div aria-hidden className="space-y-4">
        <div className="h-3 w-40 rounded-full bg-[var(--surface-inset)]" />
        <div className="h-9 w-80 max-w-full rounded-token-sm bg-[var(--surface-inset)]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-64 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)]" />
          ))}
        </div>
      </div>
    </main>
  );
}
