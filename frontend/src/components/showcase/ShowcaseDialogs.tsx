'use client';

/**
 * The two workflows a showcase card can trigger:
 * "Customize for me" (guided questions → editable prompt → workspace) and
 * "Use in GitHub" (repository selection → server-side export).
 *
 * Kept separate from any particular layout so the grid, the browser on /showcase,
 * and the workspace all drive identical behaviour instead of re-implementing it.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { type ShowcaseTemplate } from '@/lib/showcase/registry';
import { buildShowcaseCommand, exportBranchName, type GuidedAnswers } from '@/lib/showcase/buildCommand';
import { savePendingCustomization } from '@/lib/showcase/pendingCustomization';
import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

async function isSignedIn(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

/**
 * Owns the dialog state for a surface that renders showcase cards.
 *
 * Returns the two openers to hand to cards, plus the dialogs to render once. Any
 * layout can use it without duplicating the flows.
 */
export function useShowcaseWorkflows(options?: {
  /**
   * Supplied by surfaces that already have a composer (the workspace). When set,
   * finishing the guided questions hands the prompt over instead of creating a
   * project and navigating away — the user is already where they need to be.
   */
  onPromptReady?: (prompt: string, template: ShowcaseTemplate) => void;
}): {
  openCustomize: (template: ShowcaseTemplate) => void;
  openGithub: (template: ShowcaseTemplate) => void;
  dialogs: ReactNode;
} {
  const router = useRouter();
  const [customizing, setCustomizing] = useState<ShowcaseTemplate | null>(null);
  const [exporting, setExporting] = useState<ShowcaseTemplate | null>(null);

  const openCustomize = useCallback((template: ShowcaseTemplate) => setCustomizing(template), []);
  const openGithub = useCallback((template: ShowcaseTemplate) => setExporting(template), []);

  const dialogs = (
    <>
      {customizing && (
        <CustomizeDialog
          template={customizing}
          onPromptReady={options?.onPromptReady}
          onClose={() => setCustomizing(null)}
          onDone={(destination) => {
            setCustomizing(null);
            router.push(destination);
          }}
        />
      )}
      {exporting && <GithubExportDialog template={exporting} onClose={() => setExporting(null)} />}
    </>
  );

  return { openCustomize, openGithub, dialogs };
}

/** Guided questions with progressive disclosure, then an editable prompt. */
function CustomizeDialog({
  template,
  onClose,
  onDone,
  onPromptReady,
}: {
  template: ShowcaseTemplate;
  onClose: () => void;
  onDone: (destination: string) => void;
  onPromptReady?: (prompt: string, template: ShowcaseTemplate) => void;
}) {
  const [step, setStep] = useState<'quick' | 'advanced' | 'review'>('quick');
  const [answers, setAnswers] = useState<GuidedAnswers>({});
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const quick = useMemo(() => template.guidedQuestions.filter((q) => q.tier === 'quick'), [template]);
  const advanced = useMemo(() => template.guidedQuestions.filter((q) => q.tier === 'advanced'), [template]);

  function set(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function goReview() {
    const command = buildShowcaseCommand({ template, answers });
    setPrompt(command.visiblePrompt);
    setStep('review');
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const command = buildShowcaseCommand({ template, answers });
      const finalPrompt = prompt.trim() || command.visiblePrompt;

      // A host surface with its own composer takes the prompt directly. No project
      // row, no navigation — the user reviews it in the composer and sends it there.
      if (onPromptReady) {
        onPromptReady(finalPrompt, template);
        onClose();
        return;
      }

      // Preserve everything before any navigation, so a sign-in round trip or a
      // refresh cannot lose the user's answers.
      const pending = savePendingCustomization({
        templateId: template.id,
        templateVersion: template.templateVersion,
        templateSlug: template.slug,
        intent: 'customize',
        answers,
        visiblePrompt: finalPrompt,
      });

      if (!(await isSignedIn())) {
        onDone(`/auth/signup?next=${encodeURIComponent('/workspace?showcase=1')}`);
        return;
      }

      // Create the user-owned project. The idempotency key is echoed into the
      // project name lookup so a double submit reuses the same row.
      await api.projects
        .create({
          name: command.projectName,
          type: 'website',
          user_prompt: finalPrompt,
        })
        .catch(() => null);

      toast.success('Project created — opening your workspace');
      onDone(`/workspace?showcase=1&template=${encodeURIComponent(template.slug)}${pending ? `&k=${encodeURIComponent(pending.idempotencyKey)}` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  const questions = step === 'quick' ? quick : advanced;

  return (
    <Dialog
      open
      onClose={onClose}
      title={step === 'review' ? 'Review your instructions' : `Customize ${template.name}`}
      description={
        step === 'review'
          ? 'Edit anything before Xroga AI starts. This is exactly what it will work from.'
          : step === 'quick'
            ? 'A few quick questions. You can skip any of them.'
            : 'Optional detail. Skip straight to review if you prefer.'
      }
      className="max-w-lg"
      footer={
        step === 'review' ? (
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setStep('quick')} disabled={busy}>
              Back
            </Button>
            <Button variant="primary" className="flex-1" loading={busy} onClick={() => void start()}>
              {onPromptReady ? 'Add to composer' : 'Start building'}
            </Button>
          </>
        ) : step === 'quick' ? (
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setStep('advanced')}>
              More options
            </Button>
            <Button variant="primary" className="flex-1" onClick={goReview}>
              Continue
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setStep('quick')}>
              Back
            </Button>
            <Button variant="primary" className="flex-1" onClick={goReview}>
              Continue
            </Button>
          </>
        )
      }
    >
      {step === 'review' ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Instructions for Xroga AI</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={8}
            className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
        </label>
      ) : (
        <div className="max-h-[46vh] space-y-3.5 overflow-y-auto pr-1">
          {questions.map((question) => (
            <div key={question.id}>
              {question.kind === 'choice' && question.choices ? (
                <Select
                  label={question.label}
                  value={answers[question.id] ?? ''}
                  onChange={(event) => set(question.id, event.target.value)}
                >
                  <option value="">No preference</option>
                  {question.choices.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </Select>
              ) : question.kind === 'textarea' ? (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{question.label}</span>
                  <textarea
                    rows={3}
                    value={answers[question.id] ?? ''}
                    placeholder={question.placeholder}
                    onChange={(event) => set(question.id, event.target.value)}
                    className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{question.label}</span>
                  <input
                    value={answers[question.id] ?? ''}
                    placeholder={question.placeholder}
                    onChange={(event) => set(question.id, event.target.value)}
                    className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

interface RepoOption {
  fullName: string;
  defaultBranch?: string;
  private?: boolean;
}

/** Repository selection, then a server-side export onto a feature branch + PR. */
function GithubExportDialog({ template, onClose }: { template: ShowcaseTemplate; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'checking' | 'connect' | 'select' | 'working' | 'done'>('checking');
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [repo, setRepo] = useState('');
  const [directory, setDirectory] = useState('');
  const [result, setResult] = useState<{
    branch: string;
    commitSha?: string;
    pullRequestUrl?: string;
    filesCreated: number;
    filesSkipped: number;
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check auth + GitHub connection, then load the user's repositories.
  const load = useCallback(async () => {
    setError(null);
    setPhase('checking');
    if (!(await isSignedIn())) {
      savePendingCustomization({
        templateId: template.id,
        templateVersion: template.templateVersion,
        templateSlug: template.slug,
        intent: 'github',
        answers: {},
        visiblePrompt: template.defaultBuildPrompt,
      });
      router.push(`/auth/signup?next=${encodeURIComponent('/dashboard/integrations#ship-setup')}`);
      return;
    }
    try {
      const status = await api.github.status();
      if (!status.connected) {
        setPhase('connect');
        return;
      }
      const list = await api.github.listRepos();
      setRepos(list.repos ?? []);
      setRepo(list.repos?.[0]?.fullName ?? '');
      setPhase('select');
    } catch {
      setError('Could not load your repositories. Please try again.');
      setPhase('select');
    }
  }, [router, template]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runExport() {
    if (!repo) return;
    setPhase('working');
    setError(null);
    try {
      const shortId = Math.random().toString(36).slice(2, 10);
      const response = await api.showcase.exportTemplate({
        templateId: template.id,
        repoFullName: repo,
        branch: exportBranchName(template.slug, shortId),
        projectName: template.name,
        userPrompt: template.defaultBuildPrompt,
        ...(directory.trim() ? { targetDirectory: directory.trim() } : {}),
      });
      setResult(response);
      setPhase('done');
    } catch (err) {
      setError((err as Error).message || 'Export failed.');
      setPhase('select');
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Use ${template.name} in GitHub`}
      description={
        phase === 'done'
          ? 'The files were pushed to a new branch.'
          : 'Xroga copies the template into a repository you own, on a new branch, and opens a pull request.'
      }
      className="max-w-lg"
      footer={
        phase === 'done' ? (
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
        ) : phase === 'connect' ? (
          <>
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => router.push('/dashboard/integrations#ship-setup')}>
              Connect GitHub
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={phase === 'working'}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={phase === 'working'}
              disabled={!repo || phase === 'checking'}
              onClick={() => void runExport()}
            >
              Create branch and PR
            </Button>
          </>
        )
      }
    >
      {phase === 'checking' && (
        <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Checking your GitHub connection…
        </p>
      )}

      {phase === 'connect' && (
        <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <GitHubIcon className="mt-0.5 h-4 w-4 shrink-0" />
          GitHub is not connected yet. Connect it once and your selection will be waiting when you come back.
        </p>
      )}

      {(phase === 'select' || phase === 'working') && (
        <div className="space-y-3.5">
          <Select label="Repository" value={repo} onChange={(event) => setRepo(event.target.value)} disabled={phase === 'working'}>
            {repos.length === 0 && <option value="">No repositories found</option>}
            {repos.map((option) => (
              <option key={option.fullName} value={option.fullName}>
                {option.fullName}
                {option.private ? ' (private)' : ''}
              </option>
            ))}
          </Select>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Target folder <span className="text-[var(--text-muted)]">(optional)</span>
            </span>
            <input
              value={directory}
              onChange={(event) => setDirectory(event.target.value)}
              placeholder="apps/site"
              disabled={phase === 'working'}
              className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            />
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
              Use a folder to avoid touching files already in the repository. Existing files are never overwritten.
            </span>
          </label>

          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-2 text-sm">
          <p className="text-[var(--text-primary)]">
            Branch <code className="rounded bg-[var(--surface-inset)] px-1 py-0.5 text-xs">{result.branch}</code>
          </p>
          <p className="text-[var(--text-secondary)]">
            {result.filesCreated} file{result.filesCreated === 1 ? '' : 's'} added
            {result.filesSkipped ? `, ${result.filesSkipped} left untouched` : ''}.
          </p>
          {result.commitSha && (
            <p className="text-[var(--text-secondary)]">
              Commit <code className="rounded bg-[var(--surface-inset)] px-1 py-0.5 text-xs">{result.commitSha.slice(0, 7)}</code>
            </p>
          )}
          {result.pullRequestUrl ? (
            <a
              href={result.pullRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-semibold text-[var(--accent)] hover:underline"
            >
              Open the pull request →
            </a>
          ) : (
            <p className="text-[var(--warning)]">A pull request was not opened. See the notes below.</p>
          )}
          {result.warnings.length > 0 && (
            <ul className="mt-1 space-y-1 text-[11px] text-[var(--text-muted)]">
              {result.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
