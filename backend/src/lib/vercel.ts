interface VercelDeployment {
  id: string;
  url: string;
  readyState: string;
}

interface VercelFile {
  file: string;
  data: string;
}

export async function deployStaticSite(
  projectName: string,
  files: VercelFile[]
): Promise<{ deployUrl: string; deploymentId: string }> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token) {
    throw new Error('VERCEL_TOKEN not configured');
  }

  const query = teamId ? `?teamId=${teamId}` : '';
  const response = await fetch(`https://api.vercel.com/v13/deployments${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      files,
      projectSettings: { framework: null },
      target: 'production',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vercel deploy failed: ${response.status} ${errText}`);
  }

  const deployment = (await response.json()) as VercelDeployment;
  const deployUrl = deployment.url.startsWith('http')
    ? deployment.url
    : `https://${deployment.url}`;

  return { deployUrl, deploymentId: deployment.id };
}
