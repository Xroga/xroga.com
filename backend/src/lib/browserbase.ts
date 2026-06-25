interface BrowserbaseSession {
  id: string;
  connectUrl: string;
}

interface BrowserbaseCreateResponse {
  id: string;
}

export async function createBrowserbaseSession(): Promise<BrowserbaseSession> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    throw new Error('Browserbase credentials not configured');
  }

  const response = await fetch('https://www.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BB-API-Key': apiKey,
    },
    body: JSON.stringify({ projectId }),
  });

  if (!response.ok) {
    throw new Error(`Browserbase session creation failed: ${response.status}`);
  }

  const data = (await response.json()) as BrowserbaseCreateResponse;
  return {
    id: data.id,
    connectUrl: `wss://connect.browserbase.com?apiKey=${apiKey}&sessionId=${data.id}`,
  };
}

export async function runBrowserbaseScript(
  script: string,
  startUrl: string
): Promise<{ screenshotBase64?: string; data?: Record<string, unknown> }> {
  const session = await createBrowserbaseSession();

  const apiKey = process.env.BROWSERBASE_API_KEY!;

  const response = await fetch(`https://www.browserbase.com/v1/sessions/${session.id}/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BB-API-Key': apiKey,
    },
    body: JSON.stringify({
      action: 'evaluate',
      script,
      url: startUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Browserbase script execution failed: ${response.status}`);
  }

  return (await response.json()) as { screenshotBase64?: string; data?: Record<string, unknown> };
}
