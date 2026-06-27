'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, ExternalLink, History } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import toast from 'react-hot-toast';
import { api, type ProjectDetail, type ProjectFile, type ProjectMessage } from '@/lib/api';
import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { FilePreview } from './FilePreview';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { cn } from '@/lib/utils';
import 'react-loading-skeleton/dist/skeleton.css';

interface ProjectDetailViewProps {
  projectId: string;
}

export function ProjectDetailView({ projectId }: ProjectDetailViewProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [version, setVersion] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects.get(projectId)
      .then((data) => {
        setProject(data);
        if (data.project_files?.length) {
          setSelectedFile(data.project_files[0]);
        }
      })
      .catch(() => toast.error('Failed to load project'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const versions = project
    ? Array.from(new Set(project.project_files.map((f) => f.version))).sort((a, b) => b - a)
    : [];

  const filteredFiles = project?.project_files.filter(
    (f) => version === 'all' || f.version === version
  ) ?? [];

  if (loading) {
    return <Skeleton height={400} baseColor="#1a1a2e" highlightColor="#2a2a3e" />;
  }

  if (!project) {
    return <p className="text-[var(--muted)]">Project not found</p>;
  }

  return (
    <PageFullscreenFrame>
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/projects" className="p-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[var(--muted)]">
              <span className="capitalize px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                {project.type}
              </span>
              <span className={cn(
                'capitalize px-2 py-0.5 rounded-full',
                project.status === 'completed' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
              )}>
                {project.status.replace('_', ' ')}
              </span>
              <span>{project.actions_used} actions used</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {project.github_repo_url && (
            <a
              href={project.github_repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--card-border)] hover:bg-white/5 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              View on GitHub
            </a>
          )}
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm"
            onClick={() => toast.success('Download started')}
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[60vh]">
        <div className="lg:w-[40%] flex flex-col rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--card-border)] font-medium text-sm">
            Chat History
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px] lg:max-h-none">
            {project.project_messages?.length ? (
              project.project_messages.map((m: ProjectMessage) => (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-lg p-3 text-sm',
                    m.role === 'user' ? 'bg-violet-500/10 ml-4' : 'bg-white/5 mr-4'
                  )}
                >
                  <p className="text-xs text-[var(--muted)] mb-1 capitalize">{m.role}</p>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--muted)] text-center py-8">No messages yet</p>
            )}
          </div>
          <div className="p-3 border-t border-[var(--card-border)]">
            <SwarmMessageLog compact />
          </div>
        </div>

        <div className="lg:w-[60%] flex flex-col rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
            <span className="font-medium text-sm">Generated Files</span>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--muted)]" />
              <select
                value={version === 'all' ? 'all' : String(version)}
                onChange={(e) => setVersion(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="text-xs bg-white/5 border border-[var(--card-border)] rounded px-2 py-1"
              >
                <option value="all">All versions</option>
                {versions.map((v) => (
                  <option key={v} value={v}>Version {v}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row flex-1 min-h-0">
            <div className="sm:w-48 border-b sm:border-b-0 sm:border-r border-[var(--card-border)] overflow-y-auto p-2 space-y-1 max-h-48 sm:max-h-none">
              {filteredFiles.length ? (
                filteredFiles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFile(f)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-colors',
                      selectedFile?.id === f.id ? 'bg-violet-500/20 text-violet-300' : 'hover:bg-white/5'
                    )}
                  >
                    {f.file_name}
                    <span className="block text-[var(--muted)]">v{f.version}</span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-[var(--muted)] p-2">No files yet</p>
              )}
            </div>
            <div className="flex-1 p-4 overflow-auto">
              {selectedFile ? (
                <FilePreview file={selectedFile} />
              ) : (
                <p className="text-sm text-[var(--muted)] text-center py-12">Select a file to preview</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </PageFullscreenFrame>
  );
}
