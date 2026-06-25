import { ProjectDetailView } from '@/components/projects/ProjectDetailView';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  return <ProjectDetailView projectId={params.id} />;
}
