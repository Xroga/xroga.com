import type { ProjectWorkspaceStatus } from '@/store/useProjectWorkspaceStore';

type LandingOutput = Record<string, unknown>;

export interface LandingOutcomeView {
  headline: string;
  statusLines: string[];
  completionNote: string;
  terminalLine: string;
  workspaceStatus: ProjectWorkspaceStatus;
  blockers: string[];
  fullyShipped: boolean;
  handoffReady: boolean;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function safeUrl(value: unknown): string {
  return typeof value === 'string' && /^https:\/\//i.test(value.trim()) ? value.trim() : '';
}

export function isLegacyFabricatedLiveText(value: unknown): boolean {
  return typeof value === 'string' && /YOUR (?:PROJECT|WEBSITE) IS LIVE!?/i.test(value);
}

/** Derive visible shipping claims only from durable backend evidence. */
export function deriveLandingOutcome(
  output: LandingOutput,
  options: { projectName: string; isUpdate: boolean },
): LandingOutcomeView {
  const shipOutcome =
    output.shipOutcome && typeof output.shipOutcome === 'object'
      ? (output.shipOutcome as Record<string, unknown>)
      : undefined;
  const blockers = Array.from(
    new Set([...strings(shipOutcome?.blockers), ...strings(output.shipBlockers)]),
  );
  const githubPushConfirmed = output.githubPushConfirmed === true;
  const deployUrl = safeUrl(output.deployUrl) || safeUrl(output.vercelPreviewUrl);
  const deployVerified = output.deployVerified === true;
  const fullyShipped =
    (output.fullyShipped === true || shipOutcome?.fullyShipped === true) &&
    githubPushConfirmed &&
    (deployUrl ? deployVerified : true);
  const handoffReady = output.handoffReady === true || shipOutcome?.handoffReady === true;
  // `output.buildOk !== false` read a *missing* field as a pass. That was survivable only
  // while the backend always sent `buildOk: true` — including in the pre-QA preview, before
  // anything had compiled. Now that the preview carries `verificationState:
  // 'generated_unverified'` instead, absence must mean "no build claim", not "the build
  // passed". So the claim has to be present and true.
  const buildOk = output.buildOk === true || shipOutcome?.buildOk === true;
  const generatedUnverified = output.verificationState === 'generated_unverified';
  const isNonWeb =
    typeof output.scaffoldKind === 'string' && /^(expo|chrome|electron)$/.test(output.scaffoldKind);
  const statusLines: string[] = [];

  const repoName = typeof output.githubRepoName === 'string' ? output.githubRepoName.trim() : '';
  if (githubPushConfirmed && repoName) statusLines.push(`GitHub · pushed ${repoName}`);
  else if (repoName.includes('/')) statusLines.push(`GitHub target · ${repoName} · not pushed`);
  else statusLines.push('GitHub · no verified push');

  if (isNonWeb) {
    statusLines.push(`Artifact · ${String(output.scaffoldKind)} · no Vercel deployment expected`);
  } else if (deployUrl && deployVerified) {
    statusLines.push(`Vercel · verified live · ${deployUrl.replace(/^https?:\/\//, '')}`);
  } else if (deployUrl) {
    statusLines.push(`Vercel · URL returned but not verified · ${deployUrl.replace(/^https?:\/\//, '')}`);
  } else {
    statusLines.push('Vercel · no verified deployment');
  }

  for (const blocker of blockers.slice(0, 4)) statusLines.push(`Blocker · ${blocker}`);

  let headline: string;
  let completionNote: string;
  let terminalLine: string;
  let workspaceStatus: ProjectWorkspaceStatus;

  if (fullyShipped) {
    headline = options.isUpdate
      ? `Updated and shipped ${options.projectName}`
      : `Shipped ${options.projectName}`;
    completionNote = deployUrl
      ? 'GitHub commit and verified live deployment are available below.'
      : 'Verified handoff evidence is available below.';
    terminalLine = deployUrl ? `Verified live · ${deployUrl}` : 'Ship verified';
    workspaceStatus = deployUrl ? 'live' : 'pushed';
  } else if (handoffReady && githubPushConfirmed) {
    headline = `${options.projectName} handoff ready`;
    completionNote = 'The source handoff is ready, but this is not a verified live deployment.';
    terminalLine = `Handoff ready · ${repoName || 'GitHub'}`;
    workspaceStatus = 'pushed';
  } else if (buildOk && blockers.length) {
    headline = `${options.projectName} built · shipping incomplete`;
    completionNote = `Not shipped: ${blockers[0]}`;
    terminalLine = `Shipping incomplete · ${blockers[0]}`;
    workspaceStatus = 'degraded';
  } else if (buildOk) {
    headline = `${options.projectName} preview ready · not shipped`;
    completionNote = 'A local preview exists, but no verified GitHub push or live deployment was recorded.';
    terminalLine = 'Preview ready · no verified ship evidence';
    workspaceStatus = 'idle';
  } else if (generatedUnverified && !blockers.length) {
    // Distinct from the branch below on purpose. "Nothing has been checked yet" and "the
    // checks came back bad" are different facts, and collapsing them into "needs attention"
    // would be as inaccurate as the `buildOk: true` this replaced — just pessimistic
    // instead of optimistic. The preview is real and viewable; the verdict is not in.
    headline = `${options.projectName} preview ready · not verified`;
    completionNote =
      'The code was generated and can be previewed, but nothing has been installed, compiled or tested yet.';
    terminalLine = 'Generated · checks not run yet';
    workspaceStatus = 'idle';
  } else {
    headline = `${options.projectName} needs attention`;
    completionNote = blockers[0]
      ? `Build blocked: ${blockers[0]}`
      : 'The build did not produce sufficient evidence to claim completion.';
    terminalLine = blockers[0] ? `Build blocked · ${blockers[0]}` : 'Build needs attention';
    workspaceStatus = 'degraded';
  }

  return {
    headline,
    statusLines,
    completionNote,
    terminalLine,
    workspaceStatus,
    blockers,
    fullyShipped,
    handoffReady,
  };
}
