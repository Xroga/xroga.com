import type { LucideIcon } from 'lucide-react';
import {
  Code2,
  Clapperboard,
  Bot,
  Gamepad2,
  Globe,
  Image,
  Film,
  Bug,
  Search,
  Box,
  Mic,
  Smartphone,
} from 'lucide-react';

export interface QuickAction {
  id: string;
  icon: LucideIcon;
  label: string;
  prompt: string;
  color: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'build-app', icon: Code2, label: 'Build App', prompt: 'Build a full-stack web app for: ', color: '#4a7aff' },
  { id: 'make-movie', icon: Clapperboard, label: 'Make Movie', prompt: 'Create a cinematic video script and storyboard for: ', color: '#a855f7' },
  { id: 'automate', icon: Bot, label: 'Automate', prompt: 'Automate this workflow for me: ', color: '#00d4ff' },
  { id: 'games', icon: Gamepad2, label: 'Games 3D/2D', prompt: 'Build a 3D/2D game: ', color: '#22c55e' },
  { id: 'website', icon: Globe, label: 'Website · Apps', prompt: 'Build a website or mobile app for: ', color: '#3b82f6' },
  { id: 'media', icon: Image, label: 'Images & Videos', prompt: 'Generate images and videos for: ', color: '#ec4899' },
  { id: 'movies', icon: Film, label: 'Movies · Dramas', prompt: 'Write a movie or drama script for: ', color: '#f59e0b' },
  { id: 'debug', icon: Bug, label: 'Debug · Code Fix', prompt: 'Debug and fix this code: ', color: '#ef4444' },
  { id: 'research', icon: Search, label: 'Web Search · Research', prompt: 'Research and summarize: ', color: '#06b6d4' },
  { id: '3d-models', icon: Box, label: '3D Models', prompt: 'Generate a 3D model for: ', color: '#8b5cf6' },
  { id: 'voice', icon: Mic, label: 'Voice TTS · Cloning', prompt: 'Create voice/TTS content for: ', color: '#14b8a6' },
  { id: 'mobile-games', icon: Smartphone, label: 'Android/iOS Games', prompt: 'Build an Android/iOS game for: ', color: '#f97316' },
];
