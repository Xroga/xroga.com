import { MARKS, type ProviderId } from './providerMarks';

/** A real provider mark (vendored path). Colour comes from CSS so state can desaturate it. */
export function Mark({ id, className, title }: { id: ProviderId; className?: string; title?: boolean }) {
  const m = MARKS[id];
  return (
    <svg className={className} viewBox="0 0 24 24" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{m.name}</title>}
      <path d={m.d} />
    </svg>
  );
}
