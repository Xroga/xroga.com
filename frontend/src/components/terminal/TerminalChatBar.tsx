'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { ChatBarActionsMenu } from './ChatBarActionsMenu';
import { ComposerToolChip } from './ComposerToolChip';
import type { ComposerInsertOptions } from './ChatBarActionsMenu';
import { buildComposerPreamble, COMPOSER_COMMANDS, COMPOSER_SKILLS, useComposerToolsStore } from '@/store/useComposerToolsStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { uploadChatImage, type ChatAttachment } from '@/lib/api';
import { IntegrationsModal } from './IntegrationsModal';
import { GithubRepoModal } from './GithubRepoModal';
import { RepoWorkspaceGateModal } from './RepoWorkspaceGateModal';
import { ChatbarShell } from '@/components/ui/Uiverse';
import {
  ChatBarDragOverlay,
  ChatBarInputRow,
  } from './ChatBarParts';
import { ChatBarFileGrid } from './ChatBarFileGrid';
import type { SendButtonState } from './ChatBarButtons';
import { autocorrectText } from '@/lib/chatSuggestions';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { dispatchCompanionEvent } from '@/lib/companion';
import { BlackHoleVButton } from './BlackHoleVButton';
import toast from 'react-hot-toast';
import { checkRepoWorkspaceReady } from '@/lib/repoWorkspaceGate';
import { ensureSelectedRepoFolder } from '@/lib/repoSessionsIndex';
import { isGeneralAdviceOrKnowledgePrompt, isWebsiteBuildPrompt } from '@/lib/chatMemory';
import { shouldRouteToPhase1 } from '@/lib/phase1Routing';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';
import { composerMaxHeightForViewport } from '@/lib/chatComposerSizing';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';
import { X, Folder, Puzzle } from 'lucide-react';
import startStyles from '@/components/dashboard/WorkspaceNewTerminal.module.css';
import { buildArtifactContextPreamble, useXrogaArtifactContext } from '@/lib/xrogaArtifactContext';
import { XrogaVoiceControl } from './XrogaVoiceControl';
import { getSelectedRepoContext } from '@/lib/repoContext';

const MIN_INPUT_H = 32;
const COMPOSER_PLACEHOLDERS = [
  'Ask Xroga anything…',
  'Build an app from an idea…',
  'Research with cited sources…',
  'Plan a workflow or scheduled task…',
  'Test a website in the browser…',
] as const;
const SLASH_ACTIONS = [
  { key: 'research', label: 'Research the web', text: 'Research this topic using current sources and cite the evidence: ' },
  { key: 'build', label: 'Build an app', text: 'Build a working app for this outcome, then test it: ' },
  { key: 'workflow', label: 'Plan a workflow', text: 'Plan a workflow with steps, permissions, approvals, and verified outputs for: ' },
  { key: 'browser', label: 'Browser automation', text: 'Use the browser to test these interactions and report evidence: ' },
  { key: 'employee', label: 'AI employee', text: 'Plan an AI employee for this outcome, showing permissions and approval steps: ' },
  { key: 'work-pack', label: 'Work pack', text: 'Plan a work pack with the required employees, tools, approvals, and outputs for: ' },
] as const;

function composerMaxHeight() {
  if (typeof window === 'undefined') return 320;
  // A long build brief should be comfortably editable on desktop while leaving
  // enough of the terminal visible to preserve context. Phones use the visual
  // viewport so the composer also contracts when the software keyboard opens.
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  return composerMaxHeightForViewport(window.innerWidth, viewportHeight);
}

function renameFile(file: File, newName: string) {
  return new File([file], newName, { type: file.type, lastModified: file.lastModified });
}

export function TerminalChatBar({ starter = false }: { starter?: boolean }) {
  const workspaceIdentity = useWorkspaceIdentity();
  const isGuest = workspaceIdentity.status === 'guest';
  const { requestAuthGate } = useWorkspaceAuthGate();
  const {
    prompt,
    setPrompt,
    loading,
    submit,
    stop,
  } = useTerminalChat();
  const hydrated = useHydrated();
  const activeArtifactId = useXrogaArtifactContext((state) => state.activeArtifactId);
  const activeArtifactTitle = useXrogaArtifactContext((state) => state.activeArtifactTitle);
  const artifactSelections = useXrogaArtifactContext((state) => state.selections);
  const removeArtifactSelection = useXrogaArtifactContext((state) => state.removeSelection);
  const clearArtifactContext = useXrogaArtifactContext((state) => state.clear);
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  /**
   * Cursor-style typing: local draft owns keystrokes so the swarm tree does not
   * re-render on every letter (that caused double characters / rewritten input).
   */
  const [draft, setDraft] = useState(prompt);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [shortcutIndex, setShortcutIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') setPlaceholderIndex(index => (index + 1) % COMPOSER_PLACEHOLDERS.length); }, 4500);
    return () => window.clearInterval(timer);
  }, []);
  const [selectedTool, setSelectedTool] = useState<({ scaffold: string } & ComposerInsertOptions) | null>(null);
  const enabledSkills = useComposerToolsStore((state) => state.enabledSkills);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const composingRef = useRef(false);
  const lastExternalPrompt = useRef(prompt);

  // Sync only when parent injects a new prompt (prefill / clear) — never while typing
  useEffect(() => {
    if (prompt === lastExternalPrompt.current) return;
    lastExternalPrompt.current = prompt;
    if (prompt !== draftRef.current) {
      setDraft(prompt);
      draftRef.current = prompt;
    }
  }, [prompt]);

  // Keep the provider's durable draft current without making the entire terminal
  // tree render on every keystroke. The provider persists this value after a short
  // debounce, so route navigation and hard refresh both restore unsent work.
  useEffect(() => {
    if (draft === prompt) return;
    const timer = window.setTimeout(() => {
      lastExternalPrompt.current = draft;
      setPrompt(draft);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, prompt, setPrompt]);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const pluginsButtonRef = useRef<HTMLButtonElement>(null);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [vercelConnected, setVercelConnected] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sendState, setSendState] = useState<SendButtonState>('idle');
  const [composerSignal, setComposerSignal] = useState(true);
  const composerSignalTimer = useRef<number | null>(null);
  const [repoGate, setRepoGate] = useState<{
    open: boolean;
    reason: 'not_connected' | 'no_repo_selected';
    message: string;
  }>({ open: false, reason: 'not_connected', message: '' });

  const triggerComposerSignal = useCallback((duration = 1200) => {
    setComposerSignal(true);
    if (composerSignalTimer.current !== null) window.clearTimeout(composerSignalTimer.current);
    composerSignalTimer.current = window.setTimeout(() => {
      setComposerSignal(false);
      composerSignalTimer.current = null;
    }, duration);
  }, []);

  // A short inner sweep introduces the composer, then yields to its steady border.
  // It is deliberately transient: the input should not glow forever while idle.
  useEffect(() => {
    triggerComposerSignal(2400);
    return () => {
      if (composerSignalTimer.current !== null) window.clearTimeout(composerSignalTimer.current);
    };
  }, [isGuest, requestAuthGate, triggerComposerSignal]);

  useEffect(() => {
    if (uploading) triggerComposerSignal(1800);
  }, [triggerComposerSignal, uploading]);

  useEffect(() => {
    if (loading) setSendState('thinking');
    else if (sendState === 'thinking') setSendState('launched');
  }, [loading, sendState]);

  useEffect(() => {
    if (sendState !== 'launched') return;
    const t = setTimeout(() => setSendState('idle'), 1400);
    return () => clearTimeout(t);
  }, [sendState]);

  useEffect(() => {
    if (isGuest) {
      setGithubConnected(false);
      setVercelConnected(false);
      return;
    }
    void api.github
      .status()
      .then((s) => setGithubConnected(s.connected))
      .catch(() => setGithubConnected(false));
    void api.vercel
      .status()
      .then((s) => setVercelConnected(s.connected))
      .catch(() => setVercelConnected(false));
  }, [isGuest]);

  // Sidebar "New Terminal" creates a clean task inside the active project. Project
  // selection is canonical workspace state and must survive task creation; only the
  // explicit "New product" action is allowed to clear it.
  useEffect(() => {
    const onNewTerminal = () => {
      if (incognito) return;
      triggerComposerSignal(2400);
      window.setTimeout(() => textareaRef.current?.focus(), 100);
    };
    window.addEventListener('xroga-request-new-terminal', onNewTerminal);
    return () => window.removeEventListener('xroga-request-new-terminal', onNewTerminal);
  }, [incognito, triggerComposerSignal]);

  useEffect(() => {
    const onCompanionAsk = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text?.trim() ?? '';
      if (text) {
        setDraft(text);
        draftRef.current = text;
        setPrompt(text);
        lastExternalPrompt.current = text;
      }
      window.setTimeout(() => textareaRef.current?.focus(), 80);
    };
    window.addEventListener('xroga:companion-ask', onCompanionAsk);
    return () => window.removeEventListener('xroga:companion-ask', onCompanionAsk);
  }, [setPrompt]);

  async function ensureRepoWorkspace(promptText?: string): Promise<boolean> {
    // Guest conversation is deliberately detached from repository/provider gates.
    // The chat provider itself is the hard boundary that prevents guest execution.
    if (isGuest || incognito) return true;
    // Sandbox website/landing/chatbot/crypto builds must not be blocked by a flaky GitHub status
    // when the user already selected a repo in the footer (or when building a simple site).
    const p = (promptText || draftRef.current || prompt || '').trim();
    // Advice / Q&A / research must never be blocked by the Connect-GitHub modal
    if (
      p &&
      (isGeneralAdviceOrKnowledgePrompt(p) ||
        shouldRouteToPhase1(p, [], undefined, { completedWebsiteBuild: false }))
    ) {
      return true;
    }
    if (p && (isWebsiteBuildPrompt(p) || requiresGitHubForBuild(p))) {
      const selected = (await import('@/lib/repoContext')).getSelectedRepoContext();
      if (selected?.repo?.includes('/')) {
        ensureSelectedRepoFolder();
        setGithubConnected(true);
        return true;
      }
    }
    // Do NOT auto-bind sticky default_repo here — that silently targets the wrong product
    // when starting a new build. Updates get sticky only when the chat layer detects an update.
    try {
      const status = await api.github.status();
      setGithubConnected(status.connected);
    } catch {
      /* gate will handle */
    }
    const ready = await checkRepoWorkspaceReady();
    if (ready.ok) {
      ensureSelectedRepoFolder();
      return true;
    }
    // Website builds can run in sandbox without GitHub — never brick the user on Connect modal
    if (p && (isWebsiteBuildPrompt(p) || requiresGitHubForBuild(p))) {
      console.warn('[TerminalChatBar] allowing sandbox build without repo gate');
      return true;
    }
    if (ready.reason === 'no_repo_selected') {
      const { notifyOpenRepoPicker } = await import('@/lib/githubProjectEvents');
      notifyOpenRepoPicker();
    }
    setRepoGate({ open: true, reason: ready.reason, message: ready.message });
    return false;
  }

  async function handleSubmit(e: React.FormEvent, interrupt = false) {
    e.preventDefault();
    if (composingRef.current) return;
    const raw = (textareaRef.current?.value ?? draft).trim();
    const text = autocorrectText(raw);
    if (!text && files.length === 0) return;
    setDraft(text);
    draftRef.current = text;
    setPrompt(text);
    lastExternalPrompt.current = text;

    if (!(await ensureRepoWorkspace(text))) {
      setSendState('idle');
      return;
    }

    dispatchCompanionEvent({ type: 'prompt_submitted', message: 'Xroga accepted your prompt and is preparing the real execution route.', source: 'runtime' });

    if (loading && !interrupt) {
      await submit(text, false, false);
      return;
    }

    if (loading && interrupt) {
      setSendState('sending');
      await submit(text, false, true);
      if (!loading) setSendState('launched');
      return;
    }

    setSendState('sending');

    let attachments: ChatAttachment[] | undefined;
    const uploadable = files.filter(
      (f) =>
        f.type.startsWith('image/') ||
        f.type === 'application/pdf' ||
        f.type.startsWith('text/') ||
        /json|markdown|csv|msword|officedocument/i.test(f.type) ||
        /\.(png|jpe?g|webp|gif|pdf|txt|md|csv|json|docx)$/i.test(f.name),
    );
    if (uploadable.length > 0) {
      setUploading(true);
      try {
        const { uploadChatFile } = await import('@/lib/api');
        attachments = await Promise.all(
          uploadable.slice(0, 4).map(async (f) => ({
            url: await uploadChatFile(f),
            mimeType: f.type || undefined,
            name: f.name,
          }))
        );
        setFiles([]);
      } catch {
        toast.error('Upload failed — try a smaller file');
        setUploading(false);
        setSendState('idle');
        return;
      }
      setUploading(false);
    }

    const hasAttach = Boolean(attachments?.length);
    const promptText =
      text ||
      (hasAttach
        ? (await import('@/lib/parseImageContent')).defaultAttachmentPrompt('', uploadable)
        : undefined);

    setDraft('');
    setSelectedTool(null);
    draftRef.current = '';
    lastExternalPrompt.current = '';
    setPrompt('');
    // Rules and skill packs are prefixed here rather than stored server-side, because
    // there is no backend field for custom instructions — prefixing the prompt is the
    // only mechanism that genuinely reaches the model. The composer states that the
    // preamble is attached, so nothing is rewritten behind the user's back.
    const preamble = buildComposerPreamble(
      useComposerToolsStore.getState().rules,
      useComposerToolsStore.getState().enabledSkills,
    );
    const artifactPreamble = incognito ? '' : buildArtifactContextPreamble(useXrogaArtifactContext.getState());
    await submit(
      promptText ? `${preamble}${artifactPreamble}${promptText}` : promptText,
      false,
      false,
      attachments,
    );
    if (!loading) setSendState('launched');
  }

  const handleVoiceDraft = useCallback(
    (spokenText: string) => {
      const text = spokenText.replace(/\s+/g, ' ').trimStart();
      setDraft(text);
      draftRef.current = text;
      setPrompt(text);
      lastExternalPrompt.current = text;
      triggerComposerSignal(700);
    },
    [setPrompt, triggerComposerSignal],
  );

  const handleVoiceSend = useCallback(
    (spokenText: string) => {
      const text = spokenText.replace(/\s+/g, ' ').trim();
      if (!text) return;
      setDraft(text);
      draftRef.current = text;
      setPrompt(text);
      lastExternalPrompt.current = text;
      triggerComposerSignal(900);
      window.requestAnimationFrame(() => {
        formRef.current?.requestSubmit();
      });
    },
    [setPrompt, triggerComposerSignal],
  );

  async function applyStyleFromFile(file: File, stylePrompt: string) {
    if (!(await ensureRepoWorkspace(stylePrompt))) return;
    setUploading(true);
    try {
      const url = await uploadChatImage(file);
      const text =
        stylePrompt.trim() ||
        'Transform this image with a modern cinematic look while keeping the same subject';
      setFiles([]);
      setPrompt('');
      await submit(text, false, false, [{ url, mimeType: file.type, name: file.name }]);
    } catch {
      toast.error('Could not upload image for style transfer');
    } finally {
      setUploading(false);
    }
  }

  /** Baseline prompt before the current mic session — speech replaces after baseline. */
  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    if (isGuest) {
      requestAuthGate('upload');
      return;
    }
    const incoming = Array.from(list).filter(
      (f) =>
        f.type.startsWith('image/') ||
        f.type === 'application/pdf' ||
        f.type.startsWith('text/') ||
        /json|markdown|csv|msword|officedocument/i.test(f.type) ||
        /\.(png|jpe?g|webp|gif|pdf|txt|md|csv|json|docx)$/i.test(f.name),
    );
    if (!incoming.length) {
      toast.error('Supported: images, PDF, TXT, MD, CSV, JSON, DOCX');
      return;
    }
    triggerComposerSignal(1800);
    setFiles((prev) => [...prev, ...incoming].slice(0, 4));
  }, [isGuest, requestAuthGate, triggerComposerSignal]);

  const requestFilePicker = useCallback(() => {
    if (isGuest) {
      requestAuthGate('upload');
      return;
    }
    fileRef.current?.click();
  }, [isGuest, requestAuthGate]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (incognito) return;
      const items = e.clipboardData?.items;
      if (!items?.length) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item?.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        imageFiles.forEach((f) => dt.items.add(f));
        addFiles(dt.files);
        toast.success(imageFiles.length === 1 ? 'Image pasted' : `${imageFiles.length} images pasted`);
      }
    },
    [addFiles, incognito]
  );

  const resizeComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = composerMaxHeight();
    const nextH = Math.max(MIN_INPUT_H, Math.min(el.scrollHeight, maxH));
    el.style.height = `${nextH}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  useEffect(() => {
    const onResize = () => resizeComposer();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [resizeComposer]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const sync = () => {
      document.documentElement.style.setProperty('--xv-chatbar-height', `${el.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [files.length, draft]);

  const shortcutMatch = !incognito ? draft.match(/(?:^|\s)([@/])([\w-]*)$/) : null;
  const shortcutQuery = shortcutMatch?.[2].toLowerCase() ?? '';
  const shortcutActions = shortcutMatch?.[1] === '@'
    ? [
        { key: 'files', label: 'Files and folders', description: 'Attach from your device', group: 'Add' },
        { key: 'project', label: 'Current project', description: 'Insert selected repository and branch', group: 'Add' },
        { key: 'browser', label: 'Browser automation', description: 'Prepare an editable browser task', group: 'Xroga workspace' },
        { key: 'goal', label: 'Goal', description: 'Describe an outcome for Xroga to pursue', group: 'Xroga workspace' },
        { key: 'plan', label: 'Plan mode', description: 'Ask for a plan before changes', group: 'Xroga workspace' },
        { key: 'sketch', label: 'Sketch', description: 'Describe a visual concept in your prompt', group: 'Xroga workspace' },
        { key: 'employees', label: 'AI Employees', description: 'Prepare a specialist delegation request', group: 'Xroga workspace' },
        { key: 'plugins', label: 'Connected apps', description: 'Choose an available integration', group: 'Plugins' },
      ].filter(action => action.key.includes(shortcutQuery) || action.label.toLowerCase().includes(shortcutQuery) || action.group.toLowerCase().includes(shortcutQuery))
    : shortcutMatch?.[1] === '/'
      ? [
          ...COMPOSER_COMMANDS.map(action => ({ key: action.id, label: action.label, description: action.description, group: 'Commands' })),
          ...SLASH_ACTIONS.filter(action => !COMPOSER_COMMANDS.some(command => command.id === action.key)).map(action => ({ key: action.key, label: action.label, description: 'Insert an editable work request', group: 'Tools' })),
          ...COMPOSER_SKILLS.map(action => ({ key: `skill-${action.id}`, label: action.label, description: enabledSkills.includes(action.id) ? 'Enabled · select to disable' : action.description, group: 'Skills' })),
          { key: 'tool-files', label: 'Attach files', description: 'Open the file picker', group: 'Tools' },
          { key: 'tool-apps', label: 'Connected apps', description: 'Choose an available integration', group: 'Tools' },
          { key: 'agent-research', label: 'Research employee', description: 'Prepare a specialist research request', group: 'Agents' },
          { key: 'agent-content', label: 'Content employee', description: 'Prepare a specialist content request', group: 'Agents' },
          { key: 'usage', label: 'Usage and billing', description: 'Open your plan and usage', group: 'Account' },
        ].filter(action => action.key.includes(shortcutQuery) || action.label.toLowerCase().includes(shortcutQuery) || action.group.toLowerCase().includes(shortcutQuery))
      : [];
  function chooseShortcut(key: string) {
    if (!shortcutMatch) return;
    const prefix = draft.slice(0, draft.length - shortcutMatch[0].trimStart().length);
    if (key === 'files' || key === 'tool-files') { setDraft(prefix); draftRef.current = prefix; requestFilePicker(); return; }
    if (key === 'plugins' || key === 'tool-apps') { setDraft(prefix); draftRef.current = prefix; setIntegrationsOpen(true); return; }
    if (key.startsWith('skill-')) { setDraft(prefix); draftRef.current = prefix; useComposerToolsStore.getState().toggleSkill(key.slice(6)); window.requestAnimationFrame(() => textareaRef.current?.focus()); return; }
    if (key === 'usage') { window.location.assign('/dashboard#plan-usage'); return; }
    let insertion = '';
    if (key === 'project') {
      const selected = getSelectedRepoContext();
      if (!selected?.repo) { toast('Choose a project first.'); setGithubOpen(true); return; }
      insertion = `${selected.repo}${selected.branch ? ` (${selected.branch})` : ''} `;
    } else if (shortcutMatch[1] === '/') insertion = COMPOSER_COMMANDS.find(action => action.id === key)?.prompt ?? SLASH_ACTIONS.find(action => action.key === key)?.text ?? '';
    else insertion = ({
      browser: 'Use browser automation to inspect or test this site, and report verified evidence: ',
      goal: 'My goal is: ',
      plan: 'Plan this work and ask for approval before changing anything: ',
      sketch: 'Help me turn this visual concept into a clear design brief: ',
      employees: 'Which AI employee capabilities are needed for this outcome, and what can be done with my available tools: ',
    } as Record<string,string>)[key] ?? '';
    if (key === 'agent-research') insertion = 'Prepare a research employee to investigate this topic, cite evidence, and ask before sensitive actions: ';
    if (key === 'agent-content') insertion = 'Prepare a content employee to write and review this deliverable: ';
    const next = `${prefix}${insertion}`;
    setDraft(next);
    draftRef.current = next;
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <>
      <IntegrationsModal open={integrationsOpen} onClose={() => setIntegrationsOpen(false)} anchorRef={pluginsButtonRef}
        onSelect={(plugin) => {
          const scaffold = 'Use the connected ' + plugin.name + ' plugin for this task: ';
          const next = draftRef.current.trim() ? scaffold + draftRef.current : scaffold;
          setSelectedTool({ label: plugin.name, category: 'Connected plugin', description: 'Connected app selected. Actual execution still follows your tool permissions.', tone: 'purple', scaffold });
          setDraft(next);
          draftRef.current = next;
          setIntegrationsOpen(false);
          window.setTimeout(() => textareaRef.current?.focus(), 20);
        }}
      />
      <GithubRepoModal
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        onSelect={(t) => {
          const next = draftRef.current + (draftRef.current ? '\n' : '') + t;
          setDraft(next);
          draftRef.current = next;
        }}
      />
      <RepoWorkspaceGateModal
        open={repoGate.open}
        reason={repoGate.reason}
        message={repoGate.message}
        onClose={() => setRepoGate((g) => ({ ...g, open: false }))}
        onReady={() => {
          setRepoGate((g) => ({ ...g, open: false }));
          void api.github
            .status()
            .then((s) => setGithubConnected(s.connected))
            .catch(() => {});
          ensureSelectedRepoFolder();
        }}
      />
      <div className="relative">
        <ChatbarShell
          ref={shellRef}
          className={cn(
            'relative',
            incognito && 'xv-chatbar-incognito',
            composerSignal && !incognito && 'xv-chatbar--inner-active',
            (dragOver || uploading || files.length > 0) && !incognito && 'xv-chatbar--upload-active'
          )}
          onDragOver={(e: React.DragEvent) => {
            if (incognito) return;
            e.preventDefault();
            if (isGuest) return;
            setDragOver(true);
            triggerComposerSignal(1500);
          }}
          onDragLeave={() => !incognito && setDragOver(false)}
          onDrop={(e: React.DragEvent) => {
            if (incognito) return;
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <ChatBarDragOverlay active={!incognito && dragOver} />

          {shortcutMatch && shortcutActions.length > 0 ? <div className="xv-composer-shortcuts" role="listbox" aria-label={shortcutMatch[1] === '@' ? 'Workspace mentions' : 'Commands, skills, tools and agents'}>
            {shortcutActions.map((action, index) => <div key={action.key}>
              {(index === 0 || shortcutActions[index - 1].group !== action.group) ? <div className="xv-composer-shortcuts-heading">{action.group}</div> : null}
              <button type="button" role="option" aria-selected={index === shortcutIndex % shortcutActions.length}
              onMouseDown={event => event.preventDefault()} onClick={() => chooseShortcut(action.key)}>
              <strong>{shortcutMatch[1]}{action.key}</strong><span>{action.description}</span>
              </button></div>)}
          </div> : null}

          {hydrated && !incognito && (activeArtifactId || artifactSelections.length > 0) ? <div className="flex max-w-full gap-1.5 overflow-x-auto px-3 pt-2" aria-label="Attached artifact context">
            {activeArtifactId ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-black/[0.035] px-2.5 py-1 text-[11px] dark:bg-white/[0.05]">Artifact: {activeArtifactTitle ?? activeArtifactId}<button type="button" onClick={clearArtifactContext} aria-label="Remove artifact context"><X className="h-3 w-3" /></button></span> : null}
            {artifactSelections.map((selection) => <span key={selection.blockId} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px]">{selection.label}<button type="button" onClick={() => removeArtifactSelection(selection.blockId)} aria-label={`Remove ${selection.label}`}><X className="h-3 w-3" /></button></span>)}
          </div> : null}

          {!incognito && hydrated && (selectedTool || enabledSkills.length > 0) ? (
            <div className="flex max-w-full flex-wrap gap-1.5 px-3 pt-2" aria-label="Selected composer tools">
              {selectedTool?.label ? <ComposerToolChip
                label={selectedTool.label}
                category={selectedTool.category ?? 'Selected action'}
                description={selectedTool.description ?? 'An editable instruction attached to this draft.'}
                tone={selectedTool.tone ?? 'blue'}
                onRemove={() => {
                  const next = draftRef.current.startsWith(selectedTool.scaffold)
                    ? draftRef.current.slice(selectedTool.scaffold.length).trimStart()
                    : draftRef.current;
                  setDraft(next);
                  draftRef.current = next;
                  setSelectedTool(null);
                  textareaRef.current?.focus();
                }}
              /> : null}
              {enabledSkills.map(id => {
                const skill = COMPOSER_SKILLS.find(item => item.id === id);
                return skill ? <ComposerToolChip key={id} label={skill.label} category="Active skill"
                  description={skill.description} tone={id === 'plan-first' ? 'orange' : id === 'tests-first' ? 'green' : id === 'no-secrets' ? 'red' : 'purple'}
                  onRemove={() => useComposerToolsStore.getState().toggleSkill(id)} /> : null;
              })}
            </div>
          ) : null}

          {/* The toolbar row above the input is gone.
              It carried Black Hole, Integrations, GitHub and Vercel as chips and
              scrolled horizontally on a phone, which is what made the composer feel
              crowded. Attach and connectors moved into the `+` menu where a composer
              normally puts them, and the remaining controls sit on the single bottom
              row, so the resting bar is the input plus one line of controls. */}

          {!incognito && (
          <ChatBarFileGrid
            files={files}
            onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
            onRename={(i, name) =>
              setFiles((prev) => prev.map((f, j) => (j === i ? renameFile(f, name) : f)))
            }
            onApplyStyle={(file, stylePrompt) => void applyStyleFromFile(file, stylePrompt)}
          />
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="px-2 sm:px-2.5 py-0.5 sm:py-1 xv-chatbar-input-form">
            <ChatBarInputRow
              arrowSend={!incognito}
              uploading={uploading}
              onUploadClick={requestFilePicker}
              hideUpload
              leadingExtras={
                !incognito ? (
                  <div className="xv-chatbar-primary-tools">
                    <ChatBarActionsMenu
                      plusIcon={!incognito}
                      className="shrink-0"
                      disabled={loading}
                      onAddFiles={requestFilePicker}
                    /* Same dialog the removed pill opened, same event dispatched — the
                       trigger moved into the menu, the behaviour did not change. */
                    onOpenIntegrations={() => {
                      if (isGuest) {
                        requestAuthGate('integration');
                        return;
                      }
                      dispatchCompanionEvent({ type: 'integration_connecting', message: 'Opening your authorised integrations.', source: 'runtime' });
                      setIntegrationsOpen(true);
                    }}
                      connectorsNeedingAttention={[githubConnected, vercelConnected].filter((c) => !c).length}
                      onInsert={(text, options) => {
                      // Fills the composer and focuses it. Deliberately not auto-sent:
                      // these are scaffolds the user finishes, and sending a
                      // half-written prompt would burn a real run.
                      const next = draftRef.current.trim() ? `${text}${draftRef.current}` : text;
                      setSelectedTool(options?.label ? { ...options, scaffold: text } : null);
                      setDraft(next);
                      draftRef.current = next;
                      window.setTimeout(() => {
                        const textarea = textareaRef.current;
                        if (!textarea) return;
                        textarea.focus();
                        if (options?.highlight && options.selectionLength) {
                          textarea.dataset.insertHighlight = options.highlight;
                          textarea.setSelectionRange(0, options.selectionLength);
                        }
                      }, 20);
                      }}
                    />
                    <BlackHoleVButton compact className="xv-companion-blackhole" />
                    <button type="button" className={startStyles.tool} aria-label="Projects" onClick={() => {
                      if (isGuest) { requestAuthGate('integration'); return; }
                      setGithubOpen(true);
                    }}><Folder aria-hidden="true" /><span>Projects</span></button>
                    <button ref={pluginsButtonRef} type="button" className={startStyles.tool} aria-label="Plugins" onClick={() => {
                      if (isGuest) { requestAuthGate('integration'); return; }
                      setIntegrationsOpen(true);
                    }}><Puzzle aria-hidden="true" /><span>Plugins</span></button>
                  </div>
                ) : null
              }
              hideMicrophone={!incognito}
              trailingExtras={
                !incognito ? (
                  <XrogaVoiceControl
                    composerText={draft}
                    onVoiceDraft={handleVoiceDraft}
                    onVoiceSend={handleVoiceSend}
                  />
                ) : null
              }
              onTranscript={(text) => {
                // Incognito keeps the existing one-shot microphone control; the
                // dashboard voice surface is intentionally not mounted there.
                setDraft((current) => {
                  const next = current.trim() ? `${current.trim()} ${text}` : text;
                  draftRef.current = next;
                  return next;
                });
                textareaRef.current?.focus();
              }}
              surface={incognito ? 'incognito' : 'dashboard'}
              compactGo={!!draft.trim()}
              sendState={sendState}
              stopping={loading}
              onStop={() => {
                stop();
                setSendState('idle');
              }}
            >
              <textarea
                ref={textareaRef}
                data-terminal-composer=""
                value={draft}
                onChange={(e) => {
                  const next = e.target.value;
                  delete e.currentTarget.dataset.insertHighlight;
                  if (selectedTool && !next.startsWith(selectedTool.scaffold)) setSelectedTool(null);
                  setDraft(next);
                  draftRef.current = next;
                  triggerComposerSignal(900);
                }}
                onFocus={() => dispatchCompanionEvent({ type: 'composer_focused', source: 'runtime' })}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={(e) => {
                  composingRef.current = false;
                  const next = e.currentTarget.value;
                  setDraft(next);
                  draftRef.current = next;
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (composingRef.current || (e.nativeEvent as KeyboardEvent).isComposing) return;
                  if (shortcutMatch && shortcutActions.length > 0) {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setShortcutIndex(index => (index + (e.key === 'ArrowDown' ? 1 : shortcutActions.length - 1)) % shortcutActions.length); return; }
                    if (e.key === 'Escape') { e.preventDefault(); setDraft(draft.slice(0, -shortcutMatch[0].trimStart().length)); return; }
                    if (e.key === 'Enter') { e.preventDefault(); chooseShortcut(shortcutActions[shortcutIndex % shortcutActions.length].key); return; }
                  }
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    if (draftRef.current.trim()) void handleSubmit(e, true);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(e, false);
                  }
                }}
                placeholder={incognito ? 'Type a private message…' : COMPOSER_PLACEHOLDERS[placeholderIndex]}
                aria-label="Message Xroga"
                rows={1}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className={cn(
                  'xv-chatbar-composer w-full pr-2 py-2 rounded-xl resize-none min-h-[34px]',
                  incognito ? 'pl-3 text-white placeholder:text-white/45' : 'pl-3 text-[var(--foreground)] placeholder:text-[var(--muted)]',
                  'bg-transparent focus:outline-none text-sm font-terminal leading-[20px]',
                  !loading && !draft && 'cursor-blink'
                )}
              />
            </ChatBarInputRow>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,application/pdf,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
              disabled={incognito || isGuest}
            />
          </form>
        </ChatbarShell>
      </div>
    </>
  );
}
