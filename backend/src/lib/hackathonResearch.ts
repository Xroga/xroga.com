import { routingPrompt } from './promptRouting.js';
import { webSearch } from './webSearch.js';

const HACKATHON =
  /\b(hackathon|hack\s*athon|solana\s+hack|ethglobal|devpost|buidl|buildathon|demo\s*day|submission\s+deadline)\b/i;

const SOLANA =
  /\b(solana|spl\s+token|anchor|metaplex|phantom\s+wallet|raydium|jupiter\s+swap|solana\s+program)\b/i;

export interface HackathonResearchBundle {
  context: string;
  isHackathon: boolean;
  chain?: 'solana' | 'ethereum' | 'generic';
}

export function detectHackathonIntent(prompt: string): {
  isHackathon: boolean;
  chain?: 'solana' | 'ethereum' | 'generic';
} {
  const text = routingPrompt(prompt);
  if (!HACKATHON.test(text) && !SOLANA.test(text)) {
    return { isHackathon: false };
  }
  const chain = SOLANA.test(text) ? 'solana' : /\b(ethereum|evm|solidity)\b/i.test(text) ? 'ethereum' : 'generic';
  return { isHackathon: HACKATHON.test(text) || SOLANA.test(text), chain };
}

export async function fetchHackathonResearch(prompt: string): Promise<HackathonResearchBundle | null> {
  const { isHackathon, chain } = detectHackathonIntent(prompt);
  if (!isHackathon) return null;

  const text = routingPrompt(prompt).slice(0, 200);
  const queries: string[] = [];

  if (chain === 'solana') {
    queries.push(`Solana hackathon 2026 requirements judging criteria ${text}`);
    queries.push(`Solana dApp best practices Anchor program UI wallet connect 2026`);
  } else if (chain === 'ethereum') {
    queries.push(`Ethereum hackathon 2026 requirements smart contract judging`);
  } else {
    queries.push(`hackathon 2026 judging criteria web3 startup requirements ${text}`);
  }

  const lines: string[] = [];
  for (const q of queries.slice(0, 2)) {
    try {
      const results = await webSearch(q, { maxResults: 3 });
      for (const r of results) {
        lines.push(`- **${r.title}** (${r.url}): ${r.content.slice(0, 150)}`);
      }
    } catch {
      /* continue */
    }
  }

  if (!lines.length) {
    return {
      isHackathon: true,
      chain,
      context: `\n## Hackathon build mode\nUser is building for a hackathon${chain === 'solana' ? ' (Solana)' : ''}. Meet judging criteria: working demo, clear UX, wallet connect if Web3, README with setup, no fake transactions — use realistic UI flows and stub on-chain calls with clear comments where needed.`,
    };
  }

  return {
    isHackathon: true,
    chain,
    context: `\n## Hackathon research (meet sponsor requirements)\n${lines.join('\n')}\n\nBuild a high-end demo that satisfies hackathon judges: complete UI, realistic flows, wallet-ready hooks for crypto, polished README, and production-quality frontend.`,
  };
}
