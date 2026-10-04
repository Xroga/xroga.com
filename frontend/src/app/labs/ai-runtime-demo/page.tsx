'use client';

import {
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Code2,
  Copy,
  Database,
  FileCode2,
  FileText,
  Globe2,
  LoaderCircle,
  MessageCircle,
  Plug,
  RefreshCcw,
  Search,
  ShieldCheck,
  Square,
  TerminalSquare,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './page.module.css';

type ScenarioKey = 'simple' | 'research' | 'repo' | 'connected' | 'build';
type Phase = 'idle' | 'working' | 'activity' | 'streaming' | 'complete' | 'stopped';
type ActivityStatus = 'done' | 'active' | 'pending';

type ActivityItem = {
  id: string;
  label: string;
  detail?: string;
  status: ActivityStatus;
  icon: 'brain' | 'search' | 'globe' | 'file' | 'code' | 'tool' | 'database' | 'verify' | 'message';
};

type Scenario = {
  label: string;
  eyebrow: string;
  prompt: string;
  answer: string;
  latencyLabel: string;
  steps: Array<Omit<ActivityItem, 'status'>>;
  sources?: Array<{ title: string; domain: string }>;
  tool?: { name: string; input: string; output: string };
};

const SCENARIOS: Record<ScenarioKey, Scenario> = {
  simple: {
    label: 'Simple chat',
    eyebrow: 'Fast response',
    prompt: 'Hi, what can you help me with?',
    answer:
      'Hi — I can help you research, reason through decisions, work with connected tools, inspect repositories, create and edit software, and turn complex tasks into finished outputs.',
    latencyLabel: '1.4s',
    steps: [
      { id: 'understand', label: 'Understanding your request', icon: 'brain' },
      { id: 'respond', label: 'Preparing response', icon: 'message' },
    ],
  },
  research: {
    label: 'Web research',
    eyebrow: 'Live sources',
    prompt: 'Search the web for the latest AI interface patterns and tell me what matters.',
    answer:
      'The strongest AI interfaces are moving away from blank waiting states toward progressive, inspectable work: visible tool activity, streamed output, source context, clear recovery controls, and compact summaries of what the system actually did.',
    latencyLabel: '6.8s',
    steps: [
      { id: 'understand', label: 'Understanding the research goal', icon: 'brain' },
      { id: 'search', label: 'Searching the web', detail: '6 queries', icon: 'search' },
      { id: 'read', label: 'Reading relevant sources', detail: '8 sources', icon: 'globe' },
      { id: 'compare', label: 'Comparing evidence', icon: 'verify' },
      { id: 'respond', label: 'Preparing sourced response', icon: 'message' },
    ],
    sources: [
      { title: 'AI interaction patterns and streaming states', domain: 'github.com' },
      { title: 'Agent UI components for tools and reasoning', domain: 'github.com' },
      { title: 'Interaction and motion quality gates', domain: 'github.com' },
      { title: 'AI-native product UI principles', domain: 'github.com' },
    ],
  },
  repo: {
    label: 'Repo analysis',
    eyebrow: 'Read-only GitHub',
    prompt: 'Analyze our repo and find why processing activity is invisible before the final answer.',
    answer:
      'The main issue is architectural: the frontend creates an empty assistant row, but the normal chat lane waits for the completed backend response. Because no intermediate events reach the activity renderer, the processing surface stays visually quiet until the answer arrives.',
    latencyLabel: '8.1s',
    steps: [
      { id: 'connect', label: 'Opening repository', detail: 'Xroga/xroga.com', icon: 'tool' },
      { id: 'files', label: 'Reading chat runtime files', detail: '7 files', icon: 'file' },
      { id: 'trace', label: 'Tracing response lifecycle', icon: 'code' },
      { id: 'verify', label: 'Checking UI state consumers', icon: 'verify' },
      { id: 'respond', label: 'Preparing findings', icon: 'message' },
    ],
    tool: {
      name: 'github.read_repository',
      input: '{ repo: "Xroga/xroga.com", scope: "chat runtime" }',
      output: 'Read 7 relevant files. No files changed.',
    },
  },
  connected: {
    label: 'Connected app',
    eyebrow: 'Tool execution',
    prompt: 'Check my connected workspace and summarize what needs attention.',
    answer:
      'I found three items that need attention: one overdue approval, one task blocked by missing context, and one item that has not changed since the last review. Nothing was modified.',
    latencyLabel: '4.9s',
    steps: [
      { id: 'connect', label: 'Checking connected workspace', icon: 'tool' },
      { id: 'read', label: 'Reading relevant records', detail: '12 records', icon: 'database' },
      { id: 'filter', label: 'Filtering items that need attention', icon: 'verify' },
      { id: 'respond', label: 'Preparing summary', icon: 'message' },
    ],
    tool: {
      name: 'workspace.read',
      input: '{ scope: "attention-needed", mode: "read-only" }',
      output: '12 records read. 3 matched. No mutations performed.',
    },
  },
  build: {
    label: 'Build work',
    eyebrow: 'Agent execution',
    prompt: 'Improve the chat processing UI and verify it works.',
    answer:
      'The preview implementation is ready: the response now shows immediate neutral feedback, then factual activity events, then streamed output. Completed work collapses into a compact summary while remaining inspectable.',
    latencyLabel: '11.7s',
    steps: [
      { id: 'plan', label: 'Planning the UI change', icon: 'brain' },
      { id: 'read', label: 'Inspecting existing components', detail: '5 files', icon: 'file' },
      { id: 'edit', label: 'Updating interaction components', detail: '3 files', icon: 'code' },
      { id: 'verify', label: 'Running UI checks', icon: 'verify' },
      { id: 'respond', label: 'Preparing change summary', icon: 'message' },
    ],
    tool: {
      name: 'xroga.build',
      input: '{ task: "processing UI preview", mode: "isolated demo" }',
      output: '3 files updated in preview scope. Production flow unchanged.',
    },
  },
};

const ICONS = {
  brain: Brain,
  search: Search,
  globe: Globe2,
  file: FileText,
  code: Code2,
  tool: Wrench,
  database: Database,
  verify: ShieldCheck,
  message: MessageCircle,
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduced;
}

function StatusDot({ status }: { status: ActivityStatus }) {
  if (status === 'done') {
    return (
      <span className={styles.statusIconDone} aria-hidden>
        <Check size={12} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className={styles.statusIconActive} aria-hidden>
        <LoaderCircle size={13} strokeWidth={2.2} />
      </span>
    );
  }
  return <span className={styles.statusIconPending} aria-hidden />;
}

function ActivityTimeline({
  items,
  compact,
}: {
  items: ActivityItem[];
  compact?: boolean;
}) {
  return (
    <ol className={compact ? styles.activityCompact : styles.activityList}>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <li
            key={item.id}
            className={[
              styles.activityRow,
              item.status === 'active' ? styles.activityActive : '',
              item.status === 'done' ? styles.activityDone : '',
              item.status === 'pending' ? styles.activityPending : '',
            ].join(' ')}
          >
            <div className={styles.activityRail}>
              <StatusDot status={item.status} />
              <span className={styles.activityLine} aria-hidden />
            </div>
            <Icon className={styles.activityKind} size={14} strokeWidth={1.9} aria-hidden />
            <div className={styles.activityText}>
              <span>{item.label}</span>
              {item.detail ? <small>{item.detail}</small> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ToolDisclosure({
  tool,
  running,
}: {
  tool: NonNullable<Scenario['tool']>;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.toolCard}>
      <button
        type="button"
        className={styles.toolHeader}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className={styles.toolIdentity}>
          <TerminalSquare size={15} />
          <span>{tool.name}</span>
          <span className={running ? styles.toolBadgeRunning : styles.toolBadgeDone}>
            {running ? 'running' : 'completed'}
          </span>
        </div>
        <ChevronDown className={open ? styles.chevronOpen : ''} size={15} />
      </button>
      {open ? (
        <div className={styles.toolBody}>
          <div>
            <span>Input</span>
            <code>{tool.input}</code>
          </div>
          <div>
            <span>Result</span>
            <code>{running ? 'Waiting for tool result…' : tool.output}</code>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Sources({ sources }: { sources: NonNullable<Scenario['sources']> }) {
  return (
    <div className={styles.sourcesWrap}>
      <div className={styles.sourcesTitle}>
        <Globe2 size={14} />
        <span>Sources used</span>
        <small>{sources.length}</small>
      </div>
      <div className={styles.sourceGrid}>
        {sources.map((source, index) => (
          <div className={styles.sourceCard} key={source.title}>
            <span className={styles.sourceIndex}>{index + 1}</span>
            <div>
              <strong>{source.title}</strong>
              <small>{source.domain}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AiRuntimeDemoPage() {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('research');
  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIndex, setStepIndex] = useState(-1);
  const [visibleAnswer, setVisibleAnswer] = useState('');
  const [activityOpen, setActivityOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const generationRef = useRef(0);
  const reducedMotion = useReducedMotion();

  const scenario = SCENARIOS[scenarioKey];

  const activity = useMemo<ActivityItem[]>(() => {
    return scenario.steps.map((step, index) => ({
      ...step,
      status:
        stepIndex < 0
          ? 'pending'
          : index < stepIndex
            ? 'done'
            : index === stepIndex
              ? phase === 'complete'
                ? 'done'
                : 'active'
              : 'pending',
    }));
  }, [phase, scenario.steps, stepIndex]);

  const runDemo = () => {
    generationRef.current += 1;
    const runId = generationRef.current;
    setPhase('working');
    setStepIndex(-1);
    setVisibleAnswer('');
    setActivityOpen(true);
    setCopied(false);

    if (reducedMotion) {
      setPhase('complete');
      setStepIndex(scenario.steps.length - 1);
      setVisibleAnswer(scenario.answer);
      return;
    }

    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(
        window.setTimeout(() => {
          if (generationRef.current === runId) fn();
        }, ms),
      );
    };

    later(520, () => {
      setPhase('activity');
      setStepIndex(0);
    });

    scenario.steps.forEach((_, index) => {
      later(1250 + index * 860, () => {
        setPhase('activity');
        setStepIndex(index);
      });
    });

    const streamStart = 1250 + scenario.steps.length * 860;
    later(streamStart, () => {
      setPhase('streaming');
      setStepIndex(scenario.steps.length - 1);

      const words = scenario.answer.split(' ');
      let cursor = 0;
      const interval = window.setInterval(() => {
        if (generationRef.current !== runId) {
          window.clearInterval(interval);
          return;
        }
        cursor += 1;
        setVisibleAnswer(words.slice(0, cursor).join(' '));
        if (cursor >= words.length) {
          window.clearInterval(interval);
          setPhase('complete');
          setStepIndex(scenario.steps.length - 1);
          later(500, () => setActivityOpen(false));
        }
      }, 38);
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  };

  useEffect(() => {
    runDemo();
    // The selected scenario is the only intentional restart trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioKey]);

  const stop = () => {
    generationRef.current += 1;
    setPhase('stopped');
  };

  const isRunning = ['working', 'activity', 'streaming'].includes(phase);
  const showAnswer = visibleAnswer.length > 0;
  const completeActivity = activity.map((item, index) => ({
    ...item,
    status: index <= stepIndex ? 'done' as const : item.status,
  }));

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <section className={styles.demoShell}>
        <aside className={styles.sidebar}>
          <div className={styles.brandRow}>
            <div className={styles.brandMark}>X</div>
            <div>
              <strong>Xroga AI</strong>
              <span>Runtime UX preview</span>
            </div>
          </div>

          <div className={styles.sidebarIntro}>
            <h1>Processing states</h1>
            <p>
              Isolated visual demo. No real tools run and nothing here changes the production chat.
            </p>
          </div>

          <nav className={styles.scenarioNav} aria-label="Demo scenarios">
            {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => {
              const item = SCENARIOS[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={scenarioKey === key ? styles.scenarioActive : styles.scenarioButton}
                  onClick={() => setScenarioKey(key)}
                >
                  <span>{item.label}</span>
                  <small>{item.eyebrow}</small>
                </button>
              );
            })}
          </nav>

          <div className={styles.sidebarNote}>
            <CircleAlert size={15} />
            <p>
              The UI shows public execution summaries only — never hidden chain-of-thought.
            </p>
          </div>
        </aside>

        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <div>
              <span className={styles.topbarEyebrow}>Preview mode</span>
              <strong>{scenario.label}</strong>
            </div>
            <div className={styles.topbarActions}>
              <button type="button" onClick={runDemo}>
                <RefreshCcw size={14} />
                Replay
              </button>
              {isRunning ? (
                <button type="button" className={styles.stopButton} onClick={stop}>
                  <Square size={12} fill="currentColor" />
                  Stop
                </button>
              ) : null}
            </div>
          </header>

          <div className={styles.chatViewport}>
            <div className={styles.chatColumn}>
              <div className={styles.userRow}>
                <div className={styles.userBubble}>{scenario.prompt}</div>
              </div>

              <article className={styles.assistantRow}>
                <div className={styles.assistantAvatar}>X</div>
                <div className={styles.assistantBody}>
                  {phase === 'working' ? (
                    <div className={styles.neutralWorking} role="status" aria-live="polite">
                      <LoaderCircle size={16} />
                      <span>Working…</span>
                    </div>
                  ) : null}

                  {phase === 'activity' || phase === 'streaming' ? (
                    <div className={styles.liveActivity} aria-live="polite">
                      <div className={styles.activityHeader}>
                        <span>Activity</span>
                        <small>Live</small>
                      </div>
                      <ActivityTimeline items={activity} />
                    </div>
                  ) : null}

                  {scenario.tool && phase !== 'working' && phase !== 'idle' ? (
                    <ToolDisclosure tool={scenario.tool} running={isRunning && phase !== 'streaming'} />
                  ) : null}

                  {showAnswer ? (
                    <div className={styles.answerBlock}>
                      <p>{visibleAnswer}</p>
                      {phase === 'streaming' ? <span className={styles.streamCursor} aria-hidden /> : null}
                    </div>
                  ) : null}

                  {phase === 'stopped' ? (
                    <div className={styles.stoppedState}>
                      <X size={15} />
                      <span>Stopped. You can replay the demo at any time.</span>
                    </div>
                  ) : null}

                  {phase === 'complete' ? (
                    <>
                      <div className={styles.completedDisclosure}>
                        <button
                          type="button"
                          onClick={() => setActivityOpen((value) => !value)}
                          aria-expanded={activityOpen}
                        >
                          <Check size={14} />
                          <span>Worked for {scenario.latencyLabel}</span>
                          <ChevronDown className={activityOpen ? styles.chevronOpen : ''} size={14} />
                        </button>
                        {activityOpen ? <ActivityTimeline compact items={completeActivity} /> : null}
                      </div>

                      {scenario.sources ? <Sources sources={scenario.sources} /> : null}

                      <div className={styles.responseActions}>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(scenario.answer);
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1500);
                          }}
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                        <button type="button" onClick={runDemo}>
                          <RefreshCcw size={14} />
                          Retry
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </article>
            </div>
          </div>

          <footer className={styles.composerPreview}>
            <div className={styles.composer}>
              <span>Ask Xroga anything…</span>
              <button type="button" onClick={runDemo} aria-label="Replay selected demo">
                <MessageCircle size={16} />
              </button>
            </div>
            <p>Demo only · no network requests · production runtime unchanged</p>
          </footer>
        </div>
      </section>
    </main>
  );
}
