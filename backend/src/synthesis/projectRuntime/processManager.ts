import type {
  ProjectRuntimeManager,
} from './manager.js';

import type {
  ProjectRuntimeProcessRecord,
  RuntimeProcessStartInput,
} from './types.js';

export class ProjectProcessManager {
  constructor(
    private readonly runtime:
      ProjectRuntimeManager,
  ) {}

  async start(
    sessionId:
      string,

    input:
      RuntimeProcessStartInput,
  ): Promise<ProjectRuntimeProcessRecord> {
    return this.runtime
      .startProcess(
        sessionId,
        input,
      );
  }

  async stop(
    sessionId:
      string,

    processId:
      string,
  ): Promise<void> {
    await this.runtime
      .stopProcess(
        sessionId,
        processId,
      );
  }

  async logs(
    sessionId:
      string,

    processId:
      string,
  ): Promise<string> {
    return this.runtime
      .logs(
        sessionId,
        processId,
      );
  }

  async restart(
    sessionId:
      string,

    process:
      ProjectRuntimeProcessRecord,
  ): Promise<ProjectRuntimeProcessRecord> {
    await this.stop(
      sessionId,
      process.processId,
    );

    return this.start(
      sessionId,
      {
        command:
          process.command,

        args:
          process.args,

        cwd:
          process.cwd,

        port:
          process.port,

        restartPolicy:
          process.restartPolicy,

        networkPolicy:
          process.networkPolicy,

        secretScopes:
          process.secretScopes,
      },
    );
  }
}
