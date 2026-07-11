import { getSupabaseAdmin } from '../config/supabase.js';

export interface PushNotificationInput {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function pushNotification(
  userId: string,
  input: PushNotificationInput
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      title: input.title,
      message: input.message,
      type: input.type ?? 'info',
      link: input.link ?? '/dashboard',
      metadata: input.metadata ?? {},
      read: false,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[NotificationService] insert failed:', error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function notifyVideoReady(
  userId: string,
  params: {
    jobId: string;
    title: string;
    prompt: string;
    streamingUrl: string;
    assistantMessageId?: string;
    durationSeconds?: number;
    outputFormat?: string;
  }
): Promise<void> {
  await pushNotification(userId, {
    title: 'Your video is ready',
    message: params.title || params.prompt.slice(0, 80) || 'Video generation complete',
    type: 'success',
    link: '/dashboard',
    metadata: {
      kind: 'video_ready',
      jobId: params.jobId,
      assistantMessageId: params.assistantMessageId,
      streamingUrl: params.streamingUrl,
      title: params.title,
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      outputFormat: params.outputFormat ?? 'mp4',
    },
  });
}

export async function notifyVideoFailed(
  userId: string,
  params: { jobId: string; prompt: string; error: string; assistantMessageId?: string }
): Promise<void> {
  await pushNotification(userId, {
    title: 'Video generation failed',
    message: params.error.slice(0, 200) || 'Something went wrong. Try again with a shorter clip.',
    type: 'error',
    link: '/dashboard',
    metadata: {
      kind: 'video_failed',
      jobId: params.jobId,
      assistantMessageId: params.assistantMessageId,
      prompt: params.prompt,
    },
  });
}

export async function notifyBuildComplete(
  userId: string,
  params: {
    projectName: string;
    prompt: string;
    githubRepoUrl?: string;
    deployUrl?: string;
    fileCount?: number;
    assistantMessageId?: string;
    deployError?: string;
  }
): Promise<void> {
  const hasDeployIssue = Boolean(params.deployError && !params.deployUrl);
  await pushNotification(userId, {
    title: hasDeployIssue ? 'Your XROGA project is ready (deploy note)' : 'Your XROGA project is complete!',
    message: hasDeployIssue
      ? `${params.projectName} — code is on GitHub. Deploy note: ${params.deployError!.slice(0, 120)}`
      : `${params.projectName} — ${params.fileCount ?? 0} files pushed${params.deployUrl ? `. Live: ${params.deployUrl}` : ''}`,
    type: hasDeployIssue ? 'warning' : 'success',
    link: '/dashboard',
    metadata: {
      kind: 'build_ready',
      projectName: params.projectName,
      prompt: params.prompt,
      githubRepoUrl: params.githubRepoUrl,
      deployUrl: params.deployUrl,
      fileCount: params.fileCount,
      assistantMessageId: params.assistantMessageId,
      deployError: params.deployError,
    },
  });
}

export async function notifyBuildFailed(
  userId: string,
  params: {
    projectName: string;
    prompt: string;
    error: string;
    assistantMessageId?: string;
  }
): Promise<void> {
  await pushNotification(userId, {
    title: 'XROGA build needs attention',
    message: params.error.slice(0, 200) || 'Build could not finish. Open the dashboard to retry.',
    type: 'error',
    link: '/dashboard',
    metadata: {
      kind: 'build_failed',
      projectName: params.projectName,
      prompt: params.prompt,
      assistantMessageId: params.assistantMessageId,
    },
  });
}
