"use client";

// Frequently used icons are inline. The remaining pinned Lucide symbols are
// fetched from a small same-origin sprite only when an answer uses them.
import { ArrowLeft, ArrowRight, BookOpen, ChartNoAxesColumn, Check, Circle, CircleCheck, Clock, Code, Database, FileText, Info, Layers, MapPin, Minus, Plus, Search, Shield, TriangleAlert } from 'lucide-react';
import catalog from './lucide-catalog.json';
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
  if (Object.hasOwn(icons, key)) {
    const Icon = icons[key as keyof typeof icons];
    return <Icon size={size} strokeWidth={1.8} aria-hidden="true" className={className} />;
  }
  if (!Object.hasOwn(catalog.names, key)) return null;
  const shard = catalog.names[key as keyof typeof catalog.names];
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
    <use href={`/native-icons/lucide-${catalog.version}-${shard}.svg#${key}`} />
  </svg>;
}
