import Link from 'next/link';

export default function ShowcaseNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">That build was not found</h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        The product you are looking for is not in the Xroga AI Showcase.
      </p>
      <Link
        href="/showcase"
        className="mt-6 inline-block rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Back to the showcase
      </Link>
    </main>
  );
}
