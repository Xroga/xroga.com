'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, FolderOpen, LoaderCircle, Search, X } from 'lucide-react';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import { api, type Project } from '@/lib/api';
import { filterProjectsForSection, loadLocalProjects, type LocalProjectEntry } from '@/lib/projectArchive';
import { continueGithubProject } from '@/lib/projectResume';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import styles from './ProjectsQuickPopover.module.css';

/** Compact project switcher. It shows real account projects, not prompt examples. */
export function ProjectsQuickPopover({ open, onClose, anchorRef }: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [remote, setRemote] = useState<Project[]>([]);
  const [local, setLocal] = useState<LocalProjectEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setQuery('');
    setError('');
    setOpeningId(null);
    setLoading(true);
    setLocal(filterProjectsForSection(loadLocalProjects()));
    void api.projects.list()
      .then(projects => { if (active) setRemote(projects); })
      .catch(() => { if (active) { setRemote([]); setError('Could not load saved projects.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const items = [
      ...remote.map(project => ({ kind: 'remote' as const, id: project.id, name: project.name, detail: project.github_repo_name || project.type || 'Xroga project', updated: project.updated_at, project })),
      ...local.map(project => ({ kind: 'local' as const, id: project.id, name: project.name, detail: project.type, updated: project.updatedAt, project })),
    ];
    return items.filter(item => !term || (item.name + ' ' + item.detail).toLowerCase().includes(term))
      .sort((a, b) => (Date.parse(b.updated || '') || 0) - (Date.parse(a.updated || '') || 0));
  }, [remote, local, query]);

  async function openProject(item: (typeof matches)[number]) {
    setOpeningId(item.id);
    setError('');
    try {
      if (item.kind === 'local') {
        resumeToDashboard({
          prompt: item.project.prompt,
          selectedId: item.id,
          selectedLabel: item.name,
          source: 'projects',
          jumpMessageId: item.project.sourceMessageId,
        });
        router.push('/workspace');
      } else if (item.project.github_repo_name?.includes('/')) {
        await continueGithubProject(item.project, router);
      } else {
        router.push('/workspace?project=' + encodeURIComponent(item.id));
      }
      onClose();
    } catch {
      setError('Could not open this project. Open the Projects page to review it.');
    } finally {
      setOpeningId(null);
    }
  }

  if (!open) return null;

  return <AnchoredPortalPopover open={open} onClose={onClose} anchorRef={anchorRef}
    placement="top-start" width={300} className={styles.menu} ariaLabel="Your projects">
    <section className={styles.panel} role="dialog" aria-label="Your projects">
      <header className={styles.header}>
        <span><FolderOpen size={16} aria-hidden="true" /> Projects</span>
        <button type="button" onClick={onClose} aria-label="Close projects"><X size={15} /></button>
      </header>
      <label className={styles.search}>
        <Search size={14} aria-hidden="true" />
        <span className="sr-only">Search projects</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a project…" />
      </label>
      <div className={styles.list} aria-label="Projects list">
        {loading ? <p className={styles.note}><LoaderCircle size={13} className="animate-spin" /> Loading your projects…</p> : null}
        {!loading && matches.length === 0 ? <p className={styles.note}>{query ? 'No matching projects.' : 'No saved projects yet. Start a build to create one.'}</p> : null}
        {!loading && matches.slice(0, 5).map(item => <button type="button" key={item.kind + item.id}
          className={styles.item} disabled={openingId !== null}
          onClick={() => void openProject(item)}>
          <FolderOpen size={16} aria-hidden="true" />
          <span><strong>{item.name}</strong><small>{item.detail}</small></span>
          {openingId === item.id ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true"/> : <ArrowUpRight size={14} aria-hidden="true"/>}
        </button>)}
      </div>
      {error ? <p className={styles.error} role="status">{error}</p> : null}
      <Link href="/dashboard/projects" onClick={onClose} className={styles.footer}>
        View all projects {matches.length > 5 ? `(${matches.length})` : ''} <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </section>
  </AnchoredPortalPopover>;
}
