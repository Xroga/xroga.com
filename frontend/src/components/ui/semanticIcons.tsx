import type { LucideIcon } from 'lucide-react';
import {
  ChartNoAxesCombined, Check, CircleCheckBig, CircleX, Clock3, Code2, Copy,
  Database, Download, Ellipsis, ExternalLink, FileCheck2, FileText, Files,
  FlaskConical, Folder, GitBranch, Globe2, History, LoaderCircle, Maximize2,
  Minimize2, MonitorSmartphone, Network, Paperclip, PlugZap, RefreshCw, Rocket,
  Search, Send, Settings, ShieldCheck, SquareTerminal, Table2, TriangleAlert,
} from 'lucide-react';

export type SemanticIconName =
  | 'working' | 'complete' | 'waiting' | 'search' | 'web' | 'file' | 'files'
  | 'folder' | 'code' | 'terminal' | 'database' | 'analytics' | 'table'
  | 'workflow' | 'git' | 'deploy' | 'send' | 'attachment' | 'connection'
  | 'security' | 'approval' | 'warning' | 'failure' | 'evidence' | 'history'
  | 'refresh' | 'copy' | 'download' | 'external' | 'expand' | 'collapse'
  | 'tests' | 'browser' | 'settings' | 'more';

const SEMANTIC_ICONS: Readonly<Record<SemanticIconName, LucideIcon>> = {
  working: LoaderCircle, complete: Check, waiting: Clock3, search: Search, web: Globe2,
  file: FileText, files: Files, folder: Folder, code: Code2, terminal: SquareTerminal,
  database: Database, analytics: ChartNoAxesCombined, table: Table2, workflow: Network,
  git: GitBranch, deploy: Rocket, send: Send, attachment: Paperclip, connection: PlugZap,
  security: ShieldCheck, approval: CircleCheckBig, warning: TriangleAlert, failure: CircleX,
  evidence: FileCheck2, history: History, refresh: RefreshCw, copy: Copy, download: Download,
  external: ExternalLink, expand: Maximize2, collapse: Minimize2, tests: FlaskConical,
  browser: MonitorSmartphone, settings: Settings, more: Ellipsis,
};

export function semanticIcon(name: SemanticIconName): LucideIcon {
  return SEMANTIC_ICONS[name];
}

export function SemanticIcon({ name, size = 16, label, className }: {
  name: SemanticIconName;
  size?: number;
  label?: string;
  className?: string;
}) {
  const Icon = semanticIcon(name);
  return <Icon size={size} className={className} aria-hidden={label ? undefined : true} aria-label={label} />;
}
