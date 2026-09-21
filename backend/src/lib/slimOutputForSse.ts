const MAX_PROJECT_FILE_COUNT =
  48;

const MAX_PROJECT_FILE_BYTES =
  200_000;

const MAX_PROJECT_FILES_TOTAL_BYTES =
  500_000;

function projectFilesFitSse(
  value: unknown,
): value is Array<{
  path: string;
  content: string;
}> {
  if (
    !Array.isArray(
      value,
    ) ||
    value.length >
      MAX_PROJECT_FILE_COUNT
  ) {
    return false;
  }

  let total =
    0;

  for (
    const file of
    value
  ) {
    if (
      !file ||
      typeof file !==
        'object'
    ) {
      return false;
    }

    const {
      path,
      content,
    } =
      file as {
        path?: unknown;
        content?: unknown;
      };

    if (
      typeof path !==
        'string' ||
      typeof content !==
        'string'
    ) {
      return false;
    }

    const bytes =
      Buffer.byteLength(
        content,
        'utf8',
      );

    if (
      bytes >
      MAX_PROJECT_FILE_BYTES
    ) {
      return false;
    }

    total +=
      bytes;

    if (
      total >
      MAX_PROJECT_FILES_TOTAL_BYTES
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Shrink build output for SSE without changing the persisted
 * canonical project result.
 */
export function slimOutputForSse(
  output:
    | Record<
        string,
        unknown
      >
    | null
    | undefined,
):
  | Record<
      string,
      unknown
    >
  | null
  | undefined {
  if (
    !output ||
    typeof output !==
      'object'
  ) {
    return output;
  }

  const o:
    Record<
      string,
      unknown
    > = {
    ...output,
  };

  if (
    Array.isArray(
      o.projectFiles,
    )
  ) {
    o.generatedFiles =
      (
        Array.isArray(
          o.generatedFiles,
        )
          ? o.generatedFiles
          : null
      ) ??
      (
        o.projectFiles as
          Array<{
            path?: string;
          }>
      )
        .map(
          (file) =>
            file.path,
        )
        .filter(
          (
            path,
          ): path is string =>
            typeof path ===
            'string',
        );

    if (
      !projectFilesFitSse(
        o.projectFiles,
      )
    ) {
      delete o.projectFiles;
    }
  }

  /*
   * softwareProject is persisted with its full canonical workspace,
   * but SSE already has the bounded projectFiles compatibility field.
   *
   * Never duplicate the whole source tree in one live frame.
   */
  if (
    o.softwareProject &&
    typeof o
      .softwareProject ===
      'object' &&
    !Array.isArray(
      o.softwareProject,
    )
  ) {
    const softwareProject =
      o.softwareProject as
        Record<
          string,
          unknown
        >;

    const workspace =
      softwareProject
        .workspace;

    if (
      workspace &&
      typeof workspace ===
        'object' &&
      !Array.isArray(
        workspace,
      )
    ) {
      const workspaceObject =
        workspace as
          Record<
            string,
            unknown
          >;

      const files =
        Array.isArray(
          workspaceObject.files,
        )
          ? workspaceObject.files
          : [];

      o.softwareProject = {
        ...softwareProject,

        workspace: {
          ...workspaceObject,

          fileCount:
            typeof workspaceObject
              .fileCount ===
              'number'
              ? workspaceObject
                  .fileCount
              : files.length,

          files: [],
        },

        workspaceFilesOmittedFromSse:
          files.length >
          0,
      };
    }
  }

  delete o.previousFiles;

  for (
    const key of [
      'html',
      'css',
      'js',
    ] as const
  ) {
    const value =
      o[key];

    if (
      typeof value ===
        'string' &&
      value.length >
        250_000
    ) {
      o[key] =
        value.slice(
          0,
          250_000,
        );
    }
  }

  if (
    Array.isArray(
      o.fileTrail,
    )
  ) {
    o.fileTrail =
      (
        o.fileTrail as
          Array<
            Record<
              string,
              unknown
            >
          >
      )
        .slice(
          0,
          48,
        )
        .map(
          (file) => ({
            path:
              file.path,

            added:
              file.added,

            removed:
              file.removed,

            before:
              typeof file
                .before ===
                'string'
                ? file.before.slice(
                    0,
                    3_000,
                  )
                : '',

            after:
              typeof file
                .after ===
                'string'
                ? file.after.slice(
                    0,
                    8_000,
                  )
                : '',
          }),
        );
  }

  if (
    typeof o.message ===
      'string' &&
    o.message.length >
      12_000
  ) {
    o.message =
      o.message.slice(
        0,
        12_000,
      );
  }

  return o;
}
