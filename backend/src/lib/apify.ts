interface ApifyRunResponse {
  data: { id: string; defaultDatasetId: string };
}

interface ApifyDatasetItem {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
  salary?: string;
}

export async function apifyScrapeJobs(
  platforms: Array<'linkedin' | 'indeed' | 'upwork'>,
  searchQuery: string,
  maxResults = 50
): Promise<ApifyDatasetItem[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    throw new Error('APIFY_API_KEY not configured');
  }

  const actorIds: Record<string, string> = {
    linkedin: 'bebity/linkedin-jobs-scraper',
    indeed: 'misceres/indeed-scraper',
    upwork: 'curious_coder/upwork-scraper',
  };

  const results = await Promise.all(
    platforms.map(async (platform) => {
      const actorId = actorIds[platform];
      try {
        const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search: searchQuery, maxItems: Math.ceil(maxResults / platforms.length) }),
        });

        if (!runRes.ok) return [] as ApifyDatasetItem[];

        const run = (await runRes.json()) as ApifyRunResponse;
        await pollApifyRun(run.data.id, apiKey);

        const dataRes = await fetch(
          `https://api.apify.com/v2/datasets/${run.data.defaultDatasetId}/items?token=${apiKey}`
        );
        if (!dataRes.ok) return [] as ApifyDatasetItem[];
        return (await dataRes.json()) as ApifyDatasetItem[];
      } catch (err) {
        console.error(`[Apify] ${platform} scrape failed:`, (err as Error).message);
        return [] as ApifyDatasetItem[];
      }
    })
  );

  return results.flat().slice(0, maxResults);
}

async function pollApifyRun(runId: string, token: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    const data = (await res.json()) as { data: { status: string } };
    if (data.data.status === 'SUCCEEDED') return;
    if (data.data.status === 'FAILED' || data.data.status === 'ABORTED') {
      throw new Error(`Apify run ${runId} failed`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Apify run timed out');
}

export function simulateJobListings(query: string, count = 50): ApifyDatasetItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `${query} Specialist ${i + 1}`,
    company: `Company ${i + 1}`,
    location: 'Remote',
    url: `https://jobs.example.com/${i + 1}`,
    description: `Looking for a ${query} professional with 3+ years experience.`,
    salary: '$80,000 - $120,000',
  }));
}
