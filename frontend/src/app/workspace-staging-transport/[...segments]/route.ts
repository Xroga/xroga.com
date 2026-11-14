import { hostedWorkspaceRequest } from '@/lib/hostedWorkspaceBridge.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await context.params;
  if (!segments.every(segment => /^[A-Za-z0-9_-]+$/.test(segment))
    || segments.at(-1) === 'download') return new Response(null, { status: 404 });
  return hostedWorkspaceRequest(request, '/api/' + segments.join('/'));
}

export { handle as GET, handle as POST, handle as DELETE };
