import { TasksView } from '@/components/dashboard/TasksView';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.tasks;

export default function TasksPage() {
  return <TasksView />;
}
