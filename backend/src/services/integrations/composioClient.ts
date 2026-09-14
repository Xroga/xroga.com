const COMPOSIO_API_BASE =
  'https://backend.composio.dev/api/v3.1';

function getComposioApiKey(): string {
  const key =
    process.env.COMPOSIO_API_KEY?.trim();

  if (!key) {
    throw new Error(
      'COMPOSIO_API_KEY is not configured',
    );
  }

  return key;
}

export async function createComposioSession(
  userId: string,
) {
  const response = await fetch(
    `${COMPOSIO_API_BASE}/tool_router/session`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key':
          getComposioApiKey(),
      },

      body: JSON.stringify({
        user_id: `xroga:${userId}`,

        tags: {
          enabled: [
            'readOnlyHint',
          ],

          disabled: [
            'destructiveHint',
          ],
        },

        workbench: {
          enable: false,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Composio session failed (${response.status})`,
    );
  }

  return response.json();
}
