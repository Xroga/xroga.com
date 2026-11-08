"use client";

// Scoped subset of the upstream Lucide adapter. Static imports avoid bundling
// a dynamic loader for thousands of icons into a chat presentation.
import { ArrowLeft, ArrowRight, BookOpen, ChartNoAxesColumn, Check, Circle, CircleCheck, Clock, Code, Database, FileText, Info, Layers, MapPin, Minus, Plus, Search, Shield, TriangleAlert } from 'lucide-react';
const icons = {
  'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'book-open': BookOpen,
  'chart-no-axes-column': ChartNoAxesColumn, check: Check, circle: Circle,
  'circle-check': CircleCheck, clock: Clock, code: Code, database: Database,
  'file-text': FileText, info: Info, layers: Layers, 'map-pin': MapPin, minus: Minus,
  plus: Plus, search: Search, shield: Shield, 'triangle-alert': TriangleAlert,
};
export function Glyph({ name, size = 18, className }: { name: unknown; size?: number; className?: string }) {
  if (typeof name !== 'string') return null;
  const key = name.trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
  if (!Object.hasOwn(icons, key)) return null;
  const Icon = icons[key as keyof typeof icons];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" className={className} />;
}
