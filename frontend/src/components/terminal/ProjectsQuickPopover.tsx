/** Founder-approved workspace chatbar release: 2026-11-14. No behavior change. */
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ExternalLink, FolderOpen, FolderPlus, GitBranch, Loader2, Plus, Search, X } from 'lucide-react';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import { api, type GitHubRepo, type Project } from '@/lib/api';
import { filterProjectsForSection, loadLocalProjects, type LocalProjectEntry } from '@/lib/projectArchive';
import { continueGithubProject } from '@/lib/projectResume';
import { clearSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import { notifyGithubRepoContext } from '@/lib/githubProjectEvents';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import styles from './ProjectsQuickPopover.module.css';

type ProjectType = 'app' | 'website' | 'game' | 'automation' | 'research';
type ProjectOption = { kind: 'remote'; id: string; name: string; detail: string; updated: string; project: Project }
  | { kind: 'local'; id: string; name: string; detail: string; updated: string; project: LocalProjectEntry };

/** Saved projects plus real server-backed project creation, both with and without a GitHub repository. */
export function ProjectsQuickPopover({ open, onClose, anchorRef }: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'create'>('list');
  const [remote, setRemote] = useState<Project[]>([]);
  const [local, setLocal] = useState<LocalProjectEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProjectType>('app');
  const [repoMode, setRepoMode] = useState<'none' | 'existing'>('none');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [repo, setRepo] = useState('');
  const [repoQuery, setRepoQuery] = useState('');
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoRefresh, setRepoRefresh] = useState(0);
  const [repoError, setRepoError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setView('list'); setQuery(''); setError(''); setOpeningId(null);
    setName(''); setDescription(''); setType('app');
    setRepoMode('none'); setRepo(''); setRepoQuery(''); setRepoError('');
    setGithubConnected(null); setRepos([]); setLoading(true);
    setLocal(filterProjectsForSection(loadLocalProjects()));
    void api.projects.list()
      .then(projects => { if (active) setRemote(projects); })
      .catch(() => { if (active) {setRemote([]);setError('Saved projects could not be loaded.');} })
      .finally(() => { if (active) setLoading(false); });
    return () => {active = false;};
  }, [open]);

  useEffect(() => {
    if (!open || view !== 'create' || repoMode !== 'existing') return;
    let active = true;
    setLoadingRepos(true);
    setRepoError('');
    void api.github.status()
      .then(async status => {
        if (!active) return;
        setGithubConnected(Boolean(status.connected));
        if (!status.connected) return;
        const result = await api.github.listRepos();
        if (active) setRepos(result.repos ?? []);
      })
      .catch(() => { if (active) setRepoError('GitHub repositories are unavailable. Retry or create without a repository.'); })
      .finally(() => { if (active) setLoadingRepos(false); });
    return () => { active = false; };
  }, [open, view, repoMode, repoRefresh]);

  const matches = useMemo<ProjectOption[]>(() => {
    const term = query.trim().toLowerCase();
    const items: ProjectOption[] = [
      ...remote.map(project => ({kind:'remote' as const,id:project.id,name:project.name,detail:project.github_repo_name || project.type || 'Xroga project',updated:project.updated_at,project})),
      ...local.map(project => ({kind:'local' as const,id:project.id,name:project.name,detail:project.githubRepoName || project.type,updated:project.updatedAt,project})),
    ];
    return items.filter(item => !term || (item.name+' '+item.detail).toLowerCase().includes(term))
      .sort((a,b) => (Date.parse(b.updated || '')||0)-(Date.parse(a.updated||'')||0));
  }, [remote,local,query]);

  const eligibleRepos = useMemo(() => {
    const q = repoQuery.trim().toLowerCase();
    return repos.filter(item => !q || item.fullName.toLowerCase().includes(q));
  }, [repos,repoQuery]);

  async function openProject(item: ProjectOption) {
    setOpeningId(item.id);
    setError('');
    try {
      if (item.kind === 'local') {
        resumeToDashboard({prompt:item.project.prompt,selectedId:item.id,selectedLabel:item.name,source:'projects',jumpMessageId:item.project.sourceMessageId});
        router.push('/workspace');
      } else if (item.project.github_repo_name?.includes('/')) {
        await continueGithubProject(item.project, router);
      } else router.push('/workspace?project='+encodeURIComponent(item.id));
      onClose();
    } catch {
      setError('Could not open the project. Try the full Projects page.');
    } finally {setOpeningId(null);}
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {setError('Enter a project name.');return;}
    const selected = repos.find(item => item.fullName === repo);
    if (repoMode === 'existing' && !selected) {setError('Choose an accessible GitHub repository first.');return;}
    setCreating(true);setError('');
    try {
      const created = await api.projects.create({
        name:trimmed,type,user_prompt:description.trim() || undefined,
        ...(selected && repoMode === 'existing' ? {
          github_repo_name:selected.fullName,
          github_repo_url:'https://github.com/'+selected.fullName,
          github_branch:selected.defaultBranch || 'main',
        } : {}),
      });
      setRemote(prev => [created,...prev.filter(item => item.id !== created.id)]);
      if (selected && repoMode === 'existing') {
        saveSelectedRepoContext({repo:selected.fullName,branch:selected.defaultBranch||'main'});
        notifyGithubRepoContext(selected.fullName,selected.defaultBranch||'main');
      } else clearSelectedRepoContext();
      onClose();
      router.push('/workspace?project='+encodeURIComponent(created.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Project could not be created. Try again.');
    } finally {setCreating(false);}
  }

  if (!open) return null;

  return <AnchoredPortalPopover open={open} onClose={onClose} anchorRef={anchorRef}
    placement="top-start" width={330} className={styles.menu} ariaLabel="Your projects">
    <section className={styles.panel} role="dialog" aria-label={view === 'create'?'Create a project':'Your projects'}>
      <header className={styles.header}>
        <span>{view === 'create' ? <button type="button" aria-label="Back to projects" onClick={() => {setView('list');setError('');}}><ArrowLeft size={16}/></button> : <FolderOpen size={16} aria-hidden="true"/>}
          <strong>{view === 'create'?'New project':'Projects'}</strong></span>
        <button type="button" onClick={onClose} aria-label="Close projects"><X size={15}/></button>
      </header>
      {view === 'list' ? <>
        <button type="button" className={styles.createShortcut} onClick={() => {setView('create');setError('');}}><FolderPlus size={16}/> Create new project <Plus size={16}/></button>
        <label className={styles.search}><Search size={14} aria-hidden="true"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a project…" aria-label="Search projects"/></label>
        <div className={styles.list} aria-label="Saved projects">
          {loading ? <p className={styles.note}><Loader2 size={13} className="animate-spin"/> Loading projects…</p> : null}
          {!loading && matches.length === 0 ? <p className={styles.note}>{query ? 'No matching projects.' : 'No projects yet. Create your first project above.'}</p> : null}
          {!loading && matches.slice(0,30).map(item => <button type="button" key={item.kind+item.id} className={styles.item} disabled={openingId!==null}
            onClick={() => void openProject(item)}><FolderOpen size={16}/><span><strong>{item.name}</strong><small>{item.detail}</small></span>
            {openingId===item.id ? <Loader2 size={14} className="animate-spin"/> : <ArrowUpRight size={14}/>}</button>)}
        </div>
        <Link href="/dashboard/projects" onClick={onClose} className={styles.footer}>View all projects <ArrowRight size={14}/></Link>
      </> : <form className={styles.form} onSubmit={event => void createProject(event)}>
        <label className={styles.label}>Project name
          <input autoFocus required maxLength={200} value={name} onChange={event => setName(event.target.value)} placeholder="My new app"/></label>
        <label className={styles.label}>Project type
          <select value={type} onChange={event => setType(event.target.value as ProjectType)}>
            <option value="app">Application</option><option value="website">Website</option><option value="game">Game</option><option value="automation">Automation</option><option value="research">Research</option>
          </select>
        </label>
        <label className={styles.label}>Description <small>(optional)</small>
          <textarea value={description} maxLength={3000} rows={2} onChange={event => setDescription(event.target.value)} placeholder="What will this project accomplish?"/></label>
        <fieldset className={styles.repoChoices}>
          <legend>Repository</legend>
          <label><input type="radio" checked={repoMode==='none'} onChange={() => {setRepoMode('none');setRepo('');}}/><span><strong>Without repository</strong><small>Save the project in your Xroga account</small></span></label>
          <label><input type="radio" checked={repoMode==='existing'} onChange={() => setRepoMode('existing')}/><span><strong>With GitHub repository</strong><small>Link an existing repository you can access</small></span></label>
        </fieldset>
        {repoMode === 'existing' ? <div className={styles.repoPicker}>
          {loadingRepos ? <p className={styles.note}><Loader2 size={13} className="animate-spin"/> Loading your repositories…</p> : null}
          {githubConnected === false ? <p className={styles.note}>GitHub is not connected. <Link href="/dashboard/integrations/github" onClick={onClose}>Connect GitHub</Link></p> : null}
          {githubConnected && <>
            <label className={styles.label}>Search repositories<input value={repoQuery} onChange={event => setRepoQuery(event.target.value)} placeholder="Owner / repository"/></label>
            <div className={styles.repos} role="radiogroup" aria-label="Choose GitHub repository">
              {eligibleRepos.length===0 && !loadingRepos ? <p className={styles.note}>No accessible repositories found.</p> : null}
              {eligibleRepos.map(item => <label key={item.fullName} className={styles.repoItem}>
                <input type="radio" name="selected-repo" checked={repo===item.fullName} onChange={() => setRepo(item.fullName)}/>
                <GitBranch size={14}/><span>{item.fullName}</span>{repo===item.fullName?<Check size={14}/>:null}
              </label>)}
            </div>
            <a className={styles.newRepo} href="https://github.com/new" target="_blank" rel="noopener noreferrer">Create repository on GitHub <ExternalLink size={13}/></a>
            <button type="button" className={styles.refreshRepos} onClick={() => setRepoRefresh(value => value + 1)}>Refresh repository list</button>
          </>}
          {repoError && <p role="status" className={styles.error}>{repoError}</p>}
        </div> : null}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" className={styles.submit} disabled={creating || (repoMode==='existing' && !repo)}>
          {creating ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} {creating ? 'Creating…':'Create project'}
        </button>
      </form>}
    </section>
  </AnchoredPortalPopover>;
}
