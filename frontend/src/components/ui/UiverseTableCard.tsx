'use client';

import { cn } from '@/lib/utils';

export interface UiverseTableRow {
  left: string;
  right: string;
}

interface UiverseTableCardProps {
  title: string;
  rows: UiverseTableRow[];
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}

export function UiverseTableCard({ title, rows, className, onClick, selected }: UiverseTableCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'xv-uiverse-table-card text-left w-full',
        onClick && 'cursor-pointer hover:ring-2 hover:ring-[var(--accent)]/30 transition-shadow',
        selected && 'ring-2 ring-[var(--accent)]/50',
        className
      )}
    >
      <div className="xv-uiverse-table-card__title">{title}</div>
      <div className="xv-uiverse-table-card__data">
        <div className="xv-uiverse-table-card__right">
          {rows.map((row, i) => (
            <div key={`l-${i}`} className="xv-uiverse-table-card__item">
              {row.left}
            </div>
          ))}
        </div>
        <div className="xv-uiverse-table-card__left">
          {rows.map((row, i) => (
            <div key={`r-${i}`} className="xv-uiverse-table-card__item">
              {row.right}
            </div>
          ))}
        </div>
      </div>
    </Wrapper>
  );
}
