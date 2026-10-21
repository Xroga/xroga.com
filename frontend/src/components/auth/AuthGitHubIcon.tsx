import { siGithub } from 'simple-icons';

export function GitHubIcon({ className }: { className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d={siGithub.path} />
  </svg>;
}
