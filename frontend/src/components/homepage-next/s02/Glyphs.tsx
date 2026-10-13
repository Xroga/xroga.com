/** Mission glyphs for the S02 selector (drawn for this page, no third-party logos). */
import type { MissionId } from './script';

export function MissionGlyph({ id }: { id: MissionId }) {
  switch (id) {
    case 'bug':
      return (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="14" rx="2.5" />
          <path d="M3 8h18" />
          <circle cx="15.5" cy="14.5" r="3.2" />
          <path d="M17.8 16.8 20.5 19.5" />
        </svg>
      );
    case 'ads':
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.8" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          <path d="M18 6l2.5-2.5" />
        </svg>
      );
    case 'extension':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M9 4.5a2 2 0 1 1 4 0V6h3.5a1.5 1.5 0 0 1 1.5 1.5V11h-1.5a2 2 0 1 0 0 4H18v3.5a1.5 1.5 0 0 1-1.5 1.5H13v-1.5a2 2 0 1 0-4 0V20H5.5A1.5 1.5 0 0 1 4 18.5V15h1.5a2 2 0 1 0 0-4H4V7.5A1.5 1.5 0 0 1 5.5 6H9z" />
        </svg>
      );
    case 'outreach':
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" />
          <path d="M14.5 5.5h6v5h-6zM14.5 5.5l3 2.6 3-2.6" />
        </svg>
      );
  }
}

