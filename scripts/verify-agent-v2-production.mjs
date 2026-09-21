import {
  randomUUID,
} from 'node:crypto';

const API_URL =
  (
    process.env.XROGA_E2E_API_URL ??
    'https://xroga-api.fly.dev'
  ).replace(
    /\/+$/,
    '',
  );

const TOKEN =
  process.env.XROGA_E2E_TOKEN
    ?.trim();

const GITHUB_REPO =
  process.env.XROGA_E2E_GITHUB_REPO
    ?.trim();

const GITHUB_BRANCH =
  process.env.XROGA_E2E_GITHUB_BRANCH
    ?.trim() ||
  'main';

const PROJECT_ROOT =
  process.env.XROGA_E2E_PROJECT_ROOT
    ?.trim() ||
  '/';

const TIMEOUT_MS =
  Number(
    process.env.XROGA_E2E_TIMEOUT_MS ??
      20 * 60 * 1000,
  );

if (!TOKEN) {
  throw new Error(
    'XROGA_E2E_TOKEN is required. Use an authenticated Xroga test-user access token.',
  );
}

if (
  !GITHUB_REPO ||
  !/^[^/\s]+\/[^/\s]+$/.test(
    GITHUB_REPO,
  )
) {
  throw new Error(
    'XROGA_E2E_GITHUB_REPO must be a dedicated connected repository in owner/repo form.',
  );
}

if (
  !Number.isFinite(
    TIMEOUT_MS,
  ) ||
  TIMEOUT_MS <
    60_000
) {
  throw new Error(
    'XROGA_E2E_TIMEOUT_MS must be at least 60000.',
  );
}

const runId =
  randomUUID();

const projectId =
  [
    'agent-v2-e2e',
    GITHUB_REPO,
    GITHUB_BRANCH,
    PROJECT_ROOT,
  ].join(':');

const prompt = [
  'Build a polished todo application.',
  'Tasks must persist after refresh using localStorage.',
  'Users must be able to add, complete, uncomplete, and delete tasks.',
  'Keep the interface polished and responsive.',
  'Run the project checks and production build.',
  'Fix any failures you encounter.',
  'Verify the finished application in the browser before completing.',
].join(' ');

const evidence = {
  startSeen:
    false,

  routeUniversal:
    false,

  agentV2Seen:
    false,

  fileMutation:
    false,

  commandStarted:
    false,

  commandCompleted:
    false,

  successfulCommand:
    false,

  checkStarted:
    false,

  checkPassed:
    false,

  repairSeen:
    false,

  previewStarted:
    false,

  previewReady:
    false,

  browserStarted:
    false,

  browserPassed:
    false,

  agentRunCompleted:
    false,

  finalComplete:
    false,

  topLevelPreview:
    false,

  progressEvents:
    0,

  softwareEvents:
    0,

  lastSequence:
    0,

  softwareEventTypes:
    new Set(),

  files:
    new Set(),

  commands:
    0,
};

function safeSummary() {
  return {
    runId,

    project:
      GITHUB_REPO,

    branch:
      GITHUB_BRANCH,

    startSeen:
      evidence.startSeen,

    routeUniversal:
      evidence.routeUniversal,

    agentV2Seen:
      evidence.agentV2Seen,

    fileMutation:
      evidence.fileMutation,

    commandStarted:
      evidence.commandStarted,

    commandCompleted:
      evidence.commandCompleted,

    successfulCommand:
      evidence.successfulCommand,

    checkStarted:
      evidence.checkStarted,

    checkPassed:
      evidence.checkPassed,

    repairSeen:
      evidence.repairSeen,

    previewStarted:
      evidence.previewStarted,

    previewReady:
      evidence.previewReady,

    browserStarted:
      evidence.browserStarted,

    browserPassed:
      evidence.browserPassed,

    agentRunCompleted:
      evidence.agentRunCompleted,

    finalComplete:
      evidence.finalComplete,

    topLevelPreview:
      evidence.topLevelPreview,

    progressEvents:
      evidence.progressEvents,

    softwareEvents:
      evidence.softwareEvents,

    lastSequence:
      evidence.lastSequence,

    fileCount:
      evidence.files.size,

    commands:
      evidence.commands,

    softwareEventTypes:
      [
        ...evidence
          .softwareEventTypes,
      ],
  };
}

function fail(
  message,
) {
  console.error(
    JSON.stringify(
      {
        ok:
          false,

        error:
          message,

        evidence:
          safeSummary(),
      },
      null,
      2,
    ),
  );

  process.exitCode =
    1;
}

function recordProgress(
  payload,
) {
  if (
    !payload ||
    typeof payload !==
      'object'
  ) {
    return;
  }

  evidence.progressEvents +=
    1;

  if (
    typeof payload.sequence ===
      'number'
  ) {
    if (
      payload.sequence >
      evidence.lastSequence
    ) {
      evidence.lastSequence =
        payload.sequence;
    }
  }

  if (
    payload.universalPath ===
    true
  ) {
    evidence.routeUniversal =
      true;
  }

  if (
    payload.softwareAgentV2 ===
      true ||
    payload.builderVersion ===
      'agent-v2'
  ) {
    evidence.agentV2Seen =
      true;
  }

  const softwareEvent =
    payload.softwareEvent;

  if (
    !softwareEvent ||
    typeof softwareEvent !==
      'object'
  ) {
    return;
  }

  if (
    softwareEvent.runId !==
    runId
  ) {
    throw new Error(
      `Agent V2 event belonged to unexpected run ${String(
        softwareEvent.runId,
      )}; expected ${runId}.`,
    );
  }

  const type =
    typeof softwareEvent.type ===
      'string'
      ? softwareEvent.type
      : '';

  const status =
    typeof softwareEvent.status ===
      'string'
      ? softwareEvent.status
      : '';

  evidence.softwareEvents +=
    1;

  if (type) {
    evidence
      .softwareEventTypes
      .add(
        type,
      );
  }

  const filePath =
    softwareEvent.evidence &&
    typeof softwareEvent.evidence ===
      'object' &&
    typeof softwareEvent.evidence
      .filePath ===
      'string'
      ? softwareEvent.evidence
          .filePath
      : null;

  if (
    filePath
  ) {
    evidence.files.add(
      filePath,
    );
  }

  switch (type) {
    case 'file.created':
    case 'file.updated':
      evidence.fileMutation =
        true;
      break;

    case 'command.started':
      evidence.commandStarted =
        true;

      evidence.commands +=
        1;
      break;

    case 'command.completed':
      evidence.commandCompleted =
        true;

      if (
        status ===
          'success' ||
        softwareEvent.evidence
          ?.exitCode ===
          0
      ) {
        evidence.successfulCommand =
          true;
      }

      break;

    case 'check.started':
      evidence.checkStarted =
        true;
      break;

    case 'check.completed':
      if (
        status ===
        'success'
      ) {
        evidence.checkPassed =
          true;
      }

      break;

    case 'repair.started':
    case 'repair.completed':
      evidence.repairSeen =
        true;
      break;

    case 'preview.starting':
      evidence.previewStarted =
        true;
      break;

    case 'preview.ready':
      if (
        status ===
        'success'
      ) {
        evidence.previewReady =
          true;
      }

      break;

    case 'browser.verification.started':
      evidence.browserStarted =
        true;
      break;

    case 'browser.verification.completed':
      if (
        status ===
        'success'
      ) {
        evidence.browserPassed =
          true;
      }

      break;

    case 'run.completed':
      if (
        status ===
        'success'
      ) {
        evidence.agentRunCompleted =
          true;
      }

      break;

    default:
      break;
  }
}

function processSse(
  eventName,
  payload,
) {
  switch (
    eventName
  ) {
    case 'start': {
      if (
        payload.runId !==
        runId
      ) {
        throw new Error(
          `Server start event changed runId from ${runId} to ${String(
            payload.runId,
          )}.`,
        );
      }

      evidence.startSeen =
        true;

      break;
    }

    case 'progress':
      recordProgress(
        payload,
      );
      break;

    case 'preview':
      evidence.topLevelPreview =
        true;
      break;

    case 'complete':
      if (
        payload.runId &&
        payload.runId !==
          runId
      ) {
        throw new Error(
          `Complete event used unexpected runId ${String(
            payload.runId,
          )}.`,
        );
      }

      if (
        payload.success !==
        true
      ) {
        throw new Error(
          'Production build returned complete with success=false.',
        );
      }

      evidence.finalComplete =
        true;
      break;

    case 'error':
      throw new Error(
        `${String(
          payload.code ??
            'BUILD_FAILED',
        )}: ${String(
          payload.error ??
            'Production Agent V2 build failed.',
        )}`,
      );

    default:
      break;
  }
}

async function pollRun(
  signal,
) {
  const response =
    await fetch(
      `${API_URL}/api/swarm/runs/${runId}?afterSequence=${evidence.lastSequence}`,
      {
        headers: {
          Authorization:
            `Bearer ${TOKEN}`,
        },

        cache:
          'no-store',

        signal,
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Run recovery returned HTTP ${response.status}.`,
    );
  }

  const run =
    await response.json();

  for (
    const event of
    run.events ??
    []
  ) {
    if (
      typeof event.sequence ===
        'number' &&
      event.sequence <=
        evidence.lastSequence
    ) {
      continue;
    }

    recordProgress(
      {
        ...event.data,

        sequence:
          event.sequence,
      },
    );
  }

  if (
    typeof run.lastSequence ===
      'number'
  ) {
    evidence.lastSequence =
      Math.max(
        evidence.lastSequence,
        run.lastSequence,
      );
  }

  return run;
}

async function recoverUntilDone(
  deadline,
  signal,
) {
  while (
    Date.now() <
    deadline
  ) {
    const run =
      await pollRun(
        signal,
      );

    if (
      run.status ===
      'complete'
    ) {
      evidence.finalComplete =
        true;

      return run;
    }

    if (
      run.status ===
        'error' ||
      run.status ===
        'cancelled'
    ) {
      throw new Error(
        `Persisted run ended as ${run.status}: ${JSON.stringify(
          run.output ??
            {},
        ).slice(
          0,
          500,
        )}`,
      );
    }

    await new Promise(
      (
        resolve,
      ) =>
        setTimeout(
          resolve,
          2000,
        ),
    );
  }

  throw new Error(
    'Timed out waiting for persisted production run.',
  );
}

async function main() {
  const controller =
    new AbortController();

  const deadline =
    Date.now() +
    TIMEOUT_MS;

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      TIMEOUT_MS,
    );

  try {
    console.log(
      JSON.stringify(
        {
          action:
            'agent-v2-production-acceptance',

          api:
            API_URL,

          runId,

          project:
            GITHUB_REPO,

          branch:
            GITHUB_BRANCH,
        },
        null,
        2,
      ),
    );

    const response =
      await fetch(
        `${API_URL}/api/swarm/execute`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'text/event-stream',

            Authorization:
              `Bearer ${TOKEN}`,
          },

          body:
            JSON.stringify({
              prompt,

              stream:
                true,

              runId,

              projectId,

              clientMeta: {
                githubTargetRepo:
                  GITHUB_REPO,

                githubTargetBranch:
                  GITHUB_BRANCH,

                projectRoot:
                  PROJECT_ROOT,

                userPrompt:
                  prompt,
              },
            }),

          signal:
            controller.signal,
        },
      );

    if (
      !response.ok
    ) {
      const body =
        await response
          .text()
          .catch(
            () => '',
          );

      throw new Error(
        `POST /api/swarm/execute returned HTTP ${response.status}: ${body.slice(
          0,
          500,
        )}`,
      );
    }

    if (
      !response.body
    ) {
      throw new Error(
        'Production swarm response had no stream body.',
      );
    }

    const reader =
      response.body
        .getReader();

    const decoder =
      new TextDecoder();

    let buffer =
      '';

    try {
      while (
        Date.now() <
        deadline
      ) {
        const {
          done,
          value,
        } =
          await reader.read();

        if (
          done
        ) {
          break;
        }

        buffer +=
          decoder.decode(
            value,
            {
              stream:
                true,
            },
          );

        const blocks =
          buffer.split(
            /\r?\n\r?\n/,
          );

        buffer =
          blocks.pop() ??
          '';

        for (
          const block of
          blocks
        ) {
          let eventName =
            'message';

          const dataLines =
            [];

          for (
            const line of
            block.split(
              /\r?\n/,
            )
          ) {
            if (
              line.startsWith(
                'event:',
              )
            ) {
              eventName =
                line
                  .slice(
                    6,
                  )
                  .trim();
            } else if (
              line.startsWith(
                'data:',
              )
            ) {
              dataLines.push(
                line
                  .slice(
                    5,
                  )
                  .trimStart(),
              );
            }
          }

          if (
            dataLines.length ===
            0
          ) {
            continue;
          }

          const raw =
            dataLines.join(
              '\n',
            );

          let payload;

          try {
            payload =
              JSON.parse(
                raw,
              );
          } catch {
            throw new Error(
              `Malformed production SSE payload for ${eventName}.`,
            );
          }

          processSse(
            eventName,
            payload,
          );

          if (
            evidence.finalComplete
          ) {
            break;
          }
        }

        if (
          evidence.finalComplete
        ) {
          break;
        }
      }
    } catch (
      streamError
    ) {
      /*
       * A dropped browser/SSE connection must not make a durable build
       * untestable. The real product uses this same persisted-run recovery
       * architecture.
       */
      console.warn(
        `Live stream interrupted; recovering run ${runId}: ${
          streamError instanceof Error
            ? streamError.message
            : String(
                streamError,
              )
        }`,
      );
    }

    let persistedRun;

    if (
      !evidence.finalComplete
    ) {
      persistedRun =
        await recoverUntilDone(
          deadline,
          controller.signal,
        );
    } else {
      persistedRun =
        await pollRun(
          controller.signal,
        );
    }

    const required = [
      [
        'start event',
        evidence.startSeen,
      ],

      [
        'Universal routing',
        evidence.routeUniversal,
      ],

      [
        'Agent V2 identity',
        evidence.agentV2Seen,
      ],

      [
        'file creation/update',
        evidence.fileMutation,
      ],

      [
        'command execution',
        evidence.commandStarted &&
          evidence.commandCompleted &&
          evidence.successfulCommand,
      ],

      [
        'deterministic checks',
        evidence.checkStarted &&
          evidence.checkPassed,
      ],

      [
        'preview startup',
        evidence.previewStarted,
      ],

      [
        'verified preview',
        evidence.previewReady,
      ],

      [
        'browser verification startup',
        evidence.browserStarted,
      ],

      [
        'browser verification pass',
        evidence.browserPassed,
      ],

      [
        'Agent V2 verified completion',
        evidence.agentRunCompleted,
      ],

      [
        'outer pipeline completion',
        evidence.finalComplete,
      ],

      [
        'persisted run completion',
        persistedRun?.status ===
          'complete',
      ],
    ];

    const missing =
      required
        .filter(
          (
            [
              ,
              passed,
            ],
          ) =>
            !passed,
        )
        .map(
          (
            [
              name,
            ],
          ) =>
            name,
        );

    if (
      missing.length
    ) {
      fail(
        `Missing required production evidence: ${missing.join(
          ', ',
        )}`,
      );

      return;
    }

    console.log(
      JSON.stringify(
        {
          ok:
            true,

          acceptance:
            'PASS',

          evidence:
            safeSummary(),

          repairRequired:
            false,

          repairObserved:
            evidence.repairSeen,

          note:
            evidence.repairSeen
              ? 'Agent V2 exercised its repair loop during this build.'
              : 'The build passed without needing repair; repair capability is not fabricated as a requirement.',
        },
        null,
        2,
      ),
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

main().catch(
  (
    error,
  ) => {
    fail(
      error instanceof Error
        ? error.message
        : String(
            error,
          ),
    );
  },
);
