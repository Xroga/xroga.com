export type PublishTarget = 'web' | 'chrome' | 'desktop' | 'mobile';

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
  hint?: string;
  href?: string;
};

export type PublishStatus = {
  web: {
    ready: boolean;
    githubConnected?: boolean;
    vercelConnected?: boolean;
    managedVercelAvailable?: boolean;
    checklist: ChecklistItem[];
  };
  chrome?: {
    ready: boolean;
    githubConnected?: boolean;
    cwsConnected?: boolean;
    checklist: ChecklistItem[];
    installSteps: string[];
  };
  desktop?: {
    ready: boolean;
    githubConnected?: boolean;
    cscSaved?: boolean;
    notarizationSaved?: boolean;
    checklist: ChecklistItem[];
    runSteps: string[];
  };
  mobile: {
    ready: boolean;
    expoTokenSaved: boolean;
    expoTokenValid: boolean | null;
    appleSaved: boolean;
    appleAscApiSaved?: boolean;
    googlePlaySaved: boolean;
    easProjectLinked?: boolean;
    checklist: ChecklistItem[];
    commands: string[];
  };
  costs: {
    xrogaPays: string[];
    userPays: string[];
  };
  easProjectId?: string | null;
  message?: string;
};

export type GitHubPublishStatus = {
  connected: boolean;
  username?: string;
};

export type VercelPublishStatus = {
  connected: boolean;
  username?: string;
  tokenValid?: boolean | null;
  canDeploy?: boolean | null;
  managedDeployAvailable?: boolean;
  warning?: string;
  error?: string;
};

export type SupabasePublishStatus = {
  connected?: boolean;
  ready?: boolean;
  provisioned?: boolean;
  oauthConnected?: boolean;
};

export type PublishProject = {
  id: string;
  name: string;
  githubRepoName?: string | null;
  githubRepoUrl?: string | null;
  branch?: string | null;
  deployUrl?: string | null;
  updatedAt?: string;
};

export type EasBuild = {
  id: string;
  status: string;
  platform?: string;
  artifactUrl?: string;
  buildDetailsPageUrl?: string;
};

export function requiredMissing(items: ChecklistItem[] | undefined): ChecklistItem[] {
  return (items ?? []).filter((item) => item.required && !item.done);
}

export function findChecklist(
  items: ChecklistItem[] | undefined,
  id: string,
): ChecklistItem | undefined {
  return (items ?? []).find((item) => item.id === id);
}
