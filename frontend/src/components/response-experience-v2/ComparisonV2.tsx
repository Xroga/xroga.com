'use client';
import { Children, isValidElement, type ReactNode } from 'react';
import styles from './response-v2.module.css';

function elements(children: ReactNode, tag: string): ReactNode[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    return child.type === tag ? [child] : elements(child.props.children, tag);
  });
}
function cells(row: ReactNode): ReactNode[] {
  if (!isValidElement<{ children?: ReactNode }>(row)) return [];
  return Children.toArray(row.props.children).filter(child => isValidElement(child));
}
function content(cell: ReactNode): ReactNode {
  return isValidElement<{ children?: ReactNode }>(cell) ? cell.props.children : cell;
}
function plain(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? plain(child.props.children) : String(child)).join('');
}

/** One semantic table at desktop, label/value comparisons in narrow containers.
 * Keep React children intact so links, emphasis and citations survive adaptation. */
export function ComparisonV2({ children }: { children: ReactNode }) {
  const rows = elements(children, 'tr');
  const headers = cells(rows[0]);
  const body = rows.slice(1).map(cells);
  const compact = headers.length >= 2 && headers.length <= 4 && body.length > 0 && body.length <= 8 && body.every(row => row.length === headers.length && row.every(cell => !/^[-+]?\d+(?:[.,]\d+)?(?:\s*%|\s*[A-Z]{3})?$/.test(plain(content(cell)).trim())));
  return <div className={styles.adaptiveComparison} data-compact={compact}>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Response table"><table>{children}</table></div>
    {compact && <div className={styles.mobileComparison}>{body.map((row,index) => <section key={index}>
      <h4>{content(row[0])}</h4><dl>{row.slice(1).map((cell,column) => <div key={column}><dt>{content(headers[column+1])}</dt><dd>{content(cell)}</dd></div>)}</dl>
    </section>)}</div>}
    <span className={styles.scrollHint}>Swipe or scroll horizontally to see all columns.</span>
  </div>;
}
