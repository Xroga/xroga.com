/** Fal.ai — cheap storyboard / draft video */

export async function generateFalVideo(prompt: string, durationSeconds = 5): Promise<string> {
  const apiKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!apiKey) throw new Error('FAL_API_KEY not configured');

  const response = await fetch('https://queue.fal.run/fal-ai/minimax/video-01-live', {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      duration: Math.min(durationSeconds, 6),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Fal video error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const queued = (await response.json()) as { request_id?: string; status_url?: string };
  const statusUrl =
    queued.status_url ??
    (queued.request_id
      ? `https://queue.fal.run/fal-ai/minimax/video-01-live/requests/${queued.request_id}/status`
      : null);
  if (!statusUrl) throw new Error('Fal video returned no status URL');

  for (let i = 0; i < 80; i++) {
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!statusRes.ok) throw new Error(`Fal status error: ${statusRes.status}`);
    const status = (await statusRes.json()) as {
      status: string;
      response_url?: string;
      video?: { url?: string };
    };
    if (status.status === 'COMPLETED') {
      if (status.video?.url) return status.video.url;
      if (status.response_url) {
        const resultRes = await fetch(status.response_url, {
          headers: { Authorization: `Key ${apiKey}` },
        });
        const result = (await resultRes.json()) as { video?: { url?: string } };
        if (result.video?.url) return result.video.url;
      }
      throw new Error('Fal completed but no video URL');
    }
    if (status.status === 'FAILED') throw new Error('Fal video generation failed');
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error('Fal video timed out');
}
