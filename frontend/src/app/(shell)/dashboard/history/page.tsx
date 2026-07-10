import { TerminalHistoryView } from '@/components/dashboard/TerminalHistoryView';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.terminalHistory;

export default function TerminalHistoryPage() {
  return <TerminalHistoryView />;
}
