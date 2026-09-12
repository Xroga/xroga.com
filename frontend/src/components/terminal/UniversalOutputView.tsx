'use client';

import { artifactPresentation, safeArtifactUri, type UniversalOutput } from '@/lib/universalOutput';

export function UniversalOutputView({ output }: { output: UniversalOutput }) {
  return (
    <section className="space-y-3 py-2 text-sm text-[var(--foreground)]" aria-label="Xroga output">
      <p>{output.summary}</p>
      {output.artifacts.map((artifact) => {
        const presentation = artifactPresentation(artifact);
        const trustedUri = safeArtifactUri(artifact.uri);
        const source = trustedUri || (artifact.inline && `data:${artifact.mediaType};base64,${artifact.inline}`);
        return (
          <article key={artifact.id} className="rounded-xl border border-[var(--border)] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{artifact.name}</span>
              <span className="shrink-0 text-xs text-[var(--muted)]">{artifact.mediaType}</span>
            </div>
            {source && presentation === 'image' ? <img src={source} alt={artifact.name} className="mt-2 max-h-72 rounded-lg object-contain" /> : null}
            {source && presentation === 'audio' ? <audio src={source} controls className="mt-2 w-full" /> : null}
            {source && presentation === 'video' ? <video src={source} controls className="mt-2 max-h-72 w-full rounded-lg" /> : null}
            {trustedUri && presentation === 'download' ? <a href={trustedUri} className="mt-2 inline-block underline" download>Download artifact</a> : null}
            {artifact.inline && presentation === 'text' ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2 text-xs dark:bg-white/5">{artifact.inline}</pre> : null}
            {!source ? <p className="mt-2 text-xs text-[var(--muted)]">Metadata only — open Files or task details to inspect this artifact.</p> : null}
          </article>
        );
      })}
      {output.blockers.length > 0 ? <p className="text-red-500">{output.blockers.join(' · ')}</p> : null}
    </section>
  );
}
