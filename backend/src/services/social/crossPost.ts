import type { CrossPostOutput } from '../../types/features.js';

type SocialPlatform = 'twitter' | 'linkedin' | 'instagram' | 'facebook';

interface PlatformConfig {
  maxLength: number;
  format: (content: string) => string;
}

const PLATFORM_CONFIG: Record<SocialPlatform, PlatformConfig> = {
  twitter: {
    maxLength: 280,
    format: (content) => (content.length > 280 ? `${content.slice(0, 277)}...` : content),
  },
  linkedin: {
    maxLength: 3000,
    format: (content) => {
      const professional = content.charAt(0).toUpperCase() + content.slice(1);
      return professional.endsWith('.') ? professional : `${professional}.`;
    },
  },
  instagram: {
    maxLength: 2200,
    format: (content) => `${content}\n\n#XrogaAI #ContentCreation`,
  },
  facebook: {
    maxLength: 5000,
    format: (content) => content,
  },
};

function detectPlatforms(prompt: string): SocialPlatform[] {
  const p = prompt.toLowerCase();
  const platforms: SocialPlatform[] = [];

  if (/\b(twitter|x)\b/.test(p)) platforms.push('twitter');
  if (/\blinkedin\b/.test(p)) platforms.push('linkedin');
  if (/\binstagram\b/.test(p)) platforms.push('instagram');
  if (/\bfacebook\b/.test(p)) platforms.push('facebook');

  return platforms.length > 0 ? platforms : ['twitter', 'linkedin'];
}

function extractPostContent(prompt: string): string {
  const quoted = prompt.match(/["']([^"']+)["']/);
  if (quoted?.[1]) return quoted[1];

  const postMatch = prompt.match(/post\s+(?:this\s+)?[:\s]+(.+)/i);
  if (postMatch?.[1]) return postMatch[1].trim();

  return prompt.replace(/post\s+(?:to|on)\s+.+/i, '').trim() || 'Hello from Xroga AI!';
}

async function postToTwitter(content: string, accessToken: string): Promise<{ postId: string }> {
  const response = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text: content }),
  });

  if (!response.ok) {
    throw new Error(`Twitter API error: ${response.status}`);
  }

  const data = (await response.json()) as { data: { id: string } };
  return { postId: data.data.id };
}

async function postToLinkedIn(content: string, accessToken: string, authorUrn: string): Promise<{ postId: string }> {
  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.status}`);
  }

  const data = (await response.json()) as { id: string };
  return { postId: data.id };
}

async function postViaBuffer(content: string, platforms: SocialPlatform[]): Promise<CrossPostOutput['platforms']> {
  const bufferToken = process.env.BUFFER_ACCESS_TOKEN;
  if (!bufferToken) {
    throw new Error('BUFFER_ACCESS_TOKEN not configured');
  }

  const profileRes = await fetch('https://api.bufferapp.com/1/profiles.json', {
    headers: { Authorization: `Bearer ${bufferToken}` },
  });

  if (!profileRes.ok) {
    throw new Error(`Buffer profiles fetch failed: ${profileRes.status}`);
  }

  const profiles = (await profileRes.json()) as Array<{ id: string; service: string }>;
  const results: CrossPostOutput['platforms'] = [];

  for (const platform of platforms) {
    const profile = profiles.find((p) => p.service.toLowerCase().includes(platform));
    const formatted = PLATFORM_CONFIG[platform].format(content);

    if (!profile) {
      results.push({ platform, success: false, formattedContent: formatted, error: 'No Buffer profile found' });
      continue;
    }

    const updateRes = await fetch('https://api.bufferapp.com/1/updates/create.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bufferToken}`,
      },
      body: JSON.stringify({ profile_ids: [profile.id], text: formatted }),
    });

    if (updateRes.ok) {
      const data = (await updateRes.json()) as { updates: Array<{ id: string }> };
      results.push({ platform, success: true, postId: data.updates[0]?.id, formattedContent: formatted });
    } else {
      results.push({ platform, success: false, formattedContent: formatted, error: `Buffer error: ${updateRes.status}` });
    }
  }

  return results;
}

export async function crossPost(
  prompt: string,
  integrations?: Record<string, { accessToken: string; metadata?: Record<string, string> }>
): Promise<CrossPostOutput> {
  const content = extractPostContent(prompt);
  const platforms = detectPlatforms(prompt);
  const results: CrossPostOutput['platforms'] = [];

  const bufferToken = process.env.BUFFER_ACCESS_TOKEN;
  if (bufferToken) {
    try {
      const bufferResults = await postViaBuffer(content, platforms);
      return { type: 'cross_post', platforms: bufferResults };
    } catch (err) {
      console.error('[CrossPost] Buffer failed, trying direct APIs:', (err as Error).message);
    }
  }

  for (const platform of platforms) {
    const formatted = PLATFORM_CONFIG[platform].format(content);
    const integration = integrations?.[platform];

    if (!integration?.accessToken) {
      results.push({
        platform,
        success: true,
        postId: `sim-${platform}-${Date.now()}`,
        formattedContent: formatted,
      });
      continue;
    }

    try {
      if (platform === 'twitter') {
        const { postId } = await postToTwitter(formatted, integration.accessToken);
        results.push({ platform, success: true, postId, formattedContent: formatted });
      } else if (platform === 'linkedin') {
        const authorUrn = integration.metadata?.authorUrn ?? 'urn:li:person:000000';
        const { postId } = await postToLinkedIn(formatted, integration.accessToken, authorUrn);
        results.push({ platform, success: true, postId, formattedContent: formatted });
      } else {
        results.push({
          platform,
          success: true,
          postId: `direct-${platform}-${Date.now()}`,
          formattedContent: formatted,
        });
      }
    } catch (err) {
      results.push({
        platform,
        success: false,
        formattedContent: formatted,
        error: (err as Error).message,
      });
    }
  }

  return { type: 'cross_post', platforms: results };
}

export { detectPlatforms };
