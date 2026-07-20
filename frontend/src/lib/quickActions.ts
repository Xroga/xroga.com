import type { LucideIcon } from 'lucide-react';
import {
  Search,
  Code2,
  FileText,
  Rocket,
  Bug,
  Globe,
  Smartphone,
  Puzzle,
  Monitor,
} from 'lucide-react';

export interface QuickAction {
  id: string;
  icon: LucideIcon;
  label: string;
  prompt: string;
  color: string;
}

/** Quick actions aligned with real ship loops */
export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'website', icon: Globe, label: 'Website', prompt: 'Build a landing page for ', color: '#60a5fa' },
  { id: 'saas', icon: Code2, label: 'SaaS', prompt: 'Build a SaaS dashboard with auth for ', color: '#22c55e' },
  { id: 'research', icon: Search, label: 'Research', prompt: 'Research deeply and summarize ', color: '#38bdf8' },
  { id: 'mobile', icon: Smartphone, label: 'Mobile', prompt: 'Build an Expo Android/iOS app for ', color: '#a78bfa' },
  { id: 'extension', icon: Puzzle, label: 'Extension', prompt: 'Build a Chrome MV3 extension that ', color: '#f59e0b' },
  { id: 'desktop', icon: Monitor, label: 'Desktop', prompt: 'Build an Electron desktop app for ', color: '#94a3b8' },
  { id: 'deploy', icon: Rocket, label: 'Ship', prompt: 'Push to GitHub and deploy on Vercel: ', color: '#ef4444' },
  { id: 'script', icon: FileText, label: 'Script', prompt: 'Write a production script to ', color: '#14b8a6' },
  { id: 'review', icon: Bug, label: 'Review', prompt: 'Review and improve this code: ', color: '#6366f1' },
];
