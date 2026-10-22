'use client';

import { memo } from 'react';

/** Stable sidebar labels: keep the row geometry fixed on hover and show long names with an ellipsis. */
export const SidebarMovingTitle = memo(function SidebarMovingTitle({ text }: { text: string }) {
  return (
    <span
      className="xv-sidebar-long-title"
      aria-label={text}
      title={text}
      style={{
        display: 'block',
        minWidth: 0,
        width: '100%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </span>
  );
});
