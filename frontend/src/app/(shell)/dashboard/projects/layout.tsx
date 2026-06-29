import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.projects;

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
