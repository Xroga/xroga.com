'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Cloud, File, FileText, FolderOpen, HardDrive, Layers3, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { api, type Project, type ProjectFile } from '@/lib/api';
import { SHOWCASE_TEMPLATES } from '@/lib/showcase/registry';
import { COMPOSER_SKILLS, useComposerToolsStore } from '@/store/useComposerToolsStore';
import { useHydrated } from '@/hooks/useHydrated';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import styles from './LibraryWorkspace.module.css';
import { LibraryFilePreview } from './LibraryFilePreview';

const sections = [
  { id: 'my-files', label: 'My Files', icon: FolderOpen, summary: 'Browse files already saved to a Xroga project.' },
  { id: 'artifacts', label: 'Artifacts', icon: FileText, summary: 'Find saved documents and other non-code project files.' },
  { id: 'templates', label: 'Templates', icon: Layers3, summary: 'Start from a real, interactive Xroga Showcase template.' },
  { id: 'skills', label: 'Skills', icon: Sparkles, summary: 'Turn on reusable instructions for your next prompt.' },
  { id: 'xroga-drive', label: 'Xroga Drive', icon: HardDrive, summary: 'Durable private storage is planned, but not available yet.' },
] as const;
type SectionId = (typeof sections)[number]['id'];
const isSection = (value: string): value is SectionId => sections.some(section => section.id === value);
const isDocument = (file: ProjectFile) => /\.(?:pdf|docx?|pptx?|xlsx?|md|txt|csv|png|jpe?g|webp|svg)$/i.test(file.file_name) || /(?:document|image|pdf)/i.test(file.file_type);

export function LibraryWorkspace() {
  const identity = useWorkspaceIdentity();
  return <AccountLibraryWorkspace key={`${identity.status}:${identity.userId ?? 'unresolved'}`} />;
}

function AccountLibraryWorkspace() {
  const identity = useWorkspaceIdentity();
  const hydrated = useHydrated();
  const enabledSkills = useComposerToolsStore(state => state.enabledSkills);
  const toggleSkill = useComposerToolsStore(state => state.toggleSkill);
  const [section, setSection] = useState<SectionId>('my-files');
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [projectsState, setProjectsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filesState, setFilesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [reload, setReload] = useState(0);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [sort, setSort] = useState<'recent' | 'name'>('recent');

  useEffect(() => {
    const sync = () => { const hash = window.location.hash.slice(1); setSection(isSection(hash) ? hash : 'my-files'); };
    sync(); window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    if (section !== 'my-files' && section !== 'artifacts') return;
    if (identity.status === 'guest') { setProjectsState('ready'); return; }
    let alive = true;
    api.projects.list().then(data => {
      if (!alive) return;
      setProjects(data);
      setProjectId(current => data.some(project => project.id === current) ? current : data[0]?.id ?? '');
      setProjectsState('ready');
    }).catch(() => { if (alive) setProjectsState('error'); });
    return () => { alive = false; };
  }, [identity.status, reload, section]);
  useEffect(() => {
    if (!projectId) { setFiles([]); setFilesState('idle'); return; }
    let alive = true;
    setFilesState('loading'); setSelectedFile(null);
    api.projects.files(projectId).then(data => { if (alive) { setFiles(data); setFilesState('ready'); } }).catch(() => { if (alive) setFilesState('error'); });
    return () => { alive = false; };
  }, [projectId, reload]);

  const query = search.trim().toLocaleLowerCase();
  const visibleFiles = useMemo(() => files.filter(file => (section !== 'artifacts' || isDocument(file)) && (!query || `${file.file_name} ${file.file_path ?? ''} ${file.file_type}`.toLocaleLowerCase().includes(query))).sort((a, b) => sort === 'name' ? a.file_name.localeCompare(b.file_name) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [files, query, section, sort]);
  const visibleTemplates = SHOWCASE_TEMPLATES.filter(template => !query || `${template.name} ${template.category} ${template.shortDescription}`.toLocaleLowerCase().includes(query));
  const visibleSkills = COMPOSER_SKILLS.filter(skill => !query || `${skill.label} ${skill.description}`.toLocaleLowerCase().includes(query));
  const current = sections.find(item => item.id === section)!;
  const CurrentIcon = current.icon;

  return <PageFullscreenFrame>
    <main className={styles.root}>
      <header className={styles.hero}>
        <div className={styles.heroIcon}><BookOpen size={21} aria-hidden="true" /></div>
        <div><p className={styles.eyebrow}>WORKSPACE LIBRARY</p><h1>Everything worth keeping.</h1><p className={styles.heroCopy}>Project files, saved results, templates and reusable skills in one calm place. Your project files still live under Projects; Xroga Drive is planned.</p></div>
      </header>
      <nav className={styles.tabs} aria-label="Library sections">
        {sections.map(item => { const Icon = item.icon; return <a key={item.id} href={`#${item.id}`} aria-current={section === item.id ? 'page' : undefined} className={section === item.id ? styles.activeTab : ''} onClick={() => { setSection(item.id); setSearch(''); setSelectedFile(null); }}><Icon size={15} aria-hidden="true" />{item.label}{item.id === 'xroga-drive' && <span className={styles.soon}>Soon</span>}</a>; })}
      </nav>
      <section className={styles.section} aria-labelledby="library-section-title">
        <div className={styles.sectionHead}><div className={styles.sectionIdentity}><span className={styles.sectionIcon}><CurrentIcon size={19} aria-hidden="true" /></span><div><p className={styles.eyebrow}>LIBRARY / {current.label.toUpperCase()}</p><h2 id="library-section-title">{current.label}</h2><p>{current.summary}</p></div></div>{section === 'templates' && <Link href="/showcase" className={styles.textLink}>Full Showcase <ArrowUpRight size={14} /></Link>}</div>

        {section !== 'xroga-drive' && <div className={styles.toolbar}>
          <label className={styles.search}><Search size={16} aria-hidden="true" /><span className="sr-only">Search {current.label}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${current.label.toLowerCase()}…`} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}</label>
          {(section === 'my-files' || section === 'artifacts') && <><label className={styles.selectLabel}><FolderOpen size={15} /><span className="sr-only">Choose project</span><select value={projectId} onChange={event => setProjectId(event.target.value)} disabled={projectsState !== 'ready' || !projects.length}><option value="">{projectsState === 'loading' ? 'Loading projects…' : 'Choose a project'}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className={styles.selectLabel}><SlidersHorizontal size={15} /><span className="sr-only">Sort files</span><select value={sort} onChange={event => setSort(event.target.value as 'recent' | 'name')}><option value="recent">Newest</option><option value="name">Name</option></select></label></>}
        </div>}

        {(section === 'my-files' || section === 'artifacts') && <>
          <p className={styles.sourceNote}>{section === 'artifacts' ? 'Showing saved document and media files in the selected project. The file API does not identify which were AI-generated.' : 'Live project files from your account. Personal uploads and cross-project storage are not yet available.'}</p>
          {identity.status === 'guest' ? <Empty icon={FolderOpen} title="Sign in to see your projects" copy="Project files are private to your account." action={<Link href="/auth/login?next=%2Fdashboard%2Flibrary">Sign in <ArrowRight size={14} /></Link>} />
            : projectsState === 'error' ? <Empty icon={FolderOpen} title="Projects could not load" copy="Your files have not been changed. Try again when the connection is ready." action={<button type="button" onClick={() => { setProjectsState('loading'); setReload(value => value + 1); }}>Retry</button>} />
            : projectsState === 'loading' ? <p className={styles.loading} role="status">Loading your projects…</p>
            : !projects.length ? <Empty icon={FolderOpen} title="No projects yet" copy="Create a project in Workspace, then its saved files will appear here." action={<Link href="/workspace">Open Workspace <ArrowRight size={14} /></Link>} />
            : filesState === 'error' ? <Empty icon={File} title="Files could not load" copy="The selected project remains unchanged." action={<button type="button" onClick={() => { setFilesState('loading'); setReload(value => value + 1); }}>Retry</button>} />
            : filesState === 'loading' ? <p className={styles.loading} role="status">Loading saved files…</p>
            : visibleFiles.length ? <div className={styles.fileLayout}><div className={styles.fileList}>{visibleFiles.map(file => <button type="button" key={file.id} className={`${styles.fileRow} ${selectedFile?.id === file.id ? styles.selectedFile : ''}`} onClick={() => setSelectedFile(file)}><span className={styles.fileGlyph}><FileText size={17} /></span><span className={styles.fileMeta}><strong>{file.file_name}</strong><small>{file.file_path || 'Project root'} · {file.file_type || 'File'}</small></span><span className={styles.fileDate}>{new Date(file.created_at).toLocaleDateString()}</span><ChevronRight size={15} /></button>)}</div><div className={styles.filePreview}>{selectedFile ? <><div className={styles.previewTop}><span className={styles.sectionIcon}><FileText size={18} /></span><span>FILE DETAILS</span><button type="button" aria-label="Close file preview" onClick={() => setSelectedFile(null)}><X size={16} /></button></div><h3>{selectedFile.file_name}</h3><dl><dt>Path</dt><dd>{selectedFile.file_path || 'Project root'}</dd><dt>Type</dt><dd>{selectedFile.file_type || 'Unknown'}</dd><dt>Version</dt><dd>{selectedFile.version}</dd><dt>Saved</dt><dd>{new Date(selectedFile.created_at).toLocaleString()}</dd></dl><LibraryFilePreview projectId={projectId} file={selectedFile} /></> : <><span className={styles.previewPlaceholder}><File size={24} /></span><strong>Select a file</strong><p>Inspect its path, version and saved content without leaving Library.</p></>}</div></div>
            : <Empty icon={File} title={query ? 'No files match your search' : section === 'artifacts' ? 'No saved documents in this project' : 'No saved files in this project'} copy={query ? 'Try a different name or clear the search.' : 'Only files saved to this project appear here.'} action={query ? <button type="button" onClick={() => setSearch('')}>Clear search</button> : <Link href="/workspace">Open Workspace <ArrowRight size={14} /></Link>} />}
        </>}

        {section === 'templates' && <><p className={styles.sourceNote}>These are existing Xroga Showcase products. Open one to inspect the live preview and customization path.</p><div className={styles.templateGrid}>{visibleTemplates.map(template => <Link href={`/showcase/${template.slug}`} key={template.id} className={styles.templateCard}><span className={styles.templateVisual} style={{ '--template-accent': template.accent } as React.CSSProperties}><span>{template.category}</span><Layers3 size={32} /></span><span className={styles.templateBody}><span className={styles.templateStatus}>{template.status === 'live' ? 'Interactive preview' : 'Build in progress'}</span><strong>{template.name}</strong><small>{template.shortDescription}</small><span className={styles.cardAction}>Explore template <ArrowUpRight size={14} /></span></span></Link>)}</div>{!visibleTemplates.length && <Empty icon={Layers3} title="No matching templates" copy="Try a broader search." action={<button type="button" onClick={() => setSearch('')}>Clear search</button>} />}</>}

        {section === 'skills' && <><p className={styles.sourceNote}>These instruction packs are saved in this browser and attached to your next Workspace prompt. They do not install external tools or run on their own.</p><div className={styles.skillGrid}>{visibleSkills.map(skill => { const enabled = hydrated && enabledSkills.includes(skill.id); return <article key={skill.id} className={styles.skillCard}><span className={styles.skillIcon}><Sparkles size={18} /></span><div><h3>{skill.label}</h3><p>{skill.description}</p><button type="button" aria-pressed={enabled} className={enabled ? styles.enabledButton : styles.enableButton} onClick={() => toggleSkill(skill.id)}>{enabled ? <><Check size={14} /> Enabled</> : 'Enable for prompts'}</button></div></article>; })}</div>{!visibleSkills.length && <Empty icon={Sparkles} title="No matching skills" copy="Try a different search." action={<button type="button" onClick={() => setSearch('')}>Clear search</button>} />}</>}

        {section === 'xroga-drive' && <div className={styles.drive}><span className={styles.driveOrbit}><Cloud size={30} /></span><span className={styles.soon}>PLANNED</span><h3>A home for work beyond a project.</h3><p>Xroga Drive is intended to hold durable private files across workspaces. It has no upload, sync or storage API yet, so there is nothing to connect or turn on here today.</p><div className={styles.driveSteps}><span><Check size={15} /> Project files are available now</span><span><Cloud size={15} /> Cross-project private storage is planned</span></div><Link href="/dashboard/projects">Browse your Projects <ArrowRight size={15} /></Link></div>}
      </section>
      <footer className={styles.footer}><span>Library surfaces only saved account data and existing features.</span><Link href="/workspace">Return to Workspace <ArrowRight size={14} /></Link></footer>
    </main>
  </PageFullscreenFrame>;
}

function Empty({ icon: Icon, title, copy, action }: { icon: typeof File; title: string; copy: string; action: React.ReactNode }) {
  return <div className={styles.empty}><span><Icon size={22} /></span><h3>{title}</h3><p>{copy}</p>{action}</div>;
}
