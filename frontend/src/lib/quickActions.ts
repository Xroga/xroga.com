import type { LucideIcon } from 'lucide-react';
import {
  MessageSquare,
  Code2,
  Image,
  Film,
  FileText,
  Box,
  Rocket,
  Globe,
  Bug,
  Mic,
} from 'lucide-react';

export interface QuickAction {
  id: string;
  icon: LucideIcon;
  label: string;
  prompt: string;
  color: string;
}

/** Top 10 quick actions per spec */
export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat', prompt: '', color: '#4a7aff' },
  { id: 'code', icon: Code2, label: 'Code', prompt: 'Write a Python script to ', color: '#22c55e' },
  { id: 'image', icon: Image, label: 'Image', prompt: 'Generate an image of ', color: '#ec4899' },
  { id: 'video', icon: Film, label: 'Video', prompt: 'Create a video about ', color: '#a855f7' },
  { id: 'script', icon: FileText, label: 'Script', prompt: 'Write a script for ', color: '#f59e0b' },
  { id: '3d', icon: Box, label: '3D', prompt: 'Generate a 3D model of ', color: '#8b5cf6' },
  { id: 'deploy', icon: Rocket, label: 'Deploy', prompt: 'Deploy my project to Vercel with production settings for ', color: '#ef4444' },
  { id: 'scrape', icon: Globe, label: 'Scrape', prompt: 'Scrape and extract data from ', color: '#06b6d4' },
  { id: 'voice', icon: Mic, label: 'Voice', prompt: 'Create voice/TTS for ', color: '#14b8a6' },
  { id: 'review', icon: Bug, label: 'Review', prompt: 'Review and improve this: ', color: '#6366f1' },
];
