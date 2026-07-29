export const HACKATHON_SOURCES = [
  { name: 'OKX Web3', role: 'Blockchain ecosystem and hackathon sponsor/organiser', url: 'https://web3.okx.com/xlayer/build-x-series', note: 'Official X Layer builder programme and hackathon information.' },
  { name: 'ETHGlobal', role: 'Independent Ethereum hackathon organiser', url: 'https://ethglobal.com/events', note: 'Official event, rules, prize, showcase, and submission information.' },
  { name: 'Solana', role: 'Blockchain ecosystem and hackathon organiser', url: 'https://solana.com/hackathon', note: 'Official Solana builder and hackathon entry point.' },
  { name: 'Chainlink', role: 'Web3 technology provider and hackathon organiser/sponsor', url: 'https://chain.link/hackathon', note: 'Official Chainlink hackathon and developer resource entry point.' },
  { name: 'Polygon', role: 'Blockchain ecosystem and technology partner', url: 'https://polygon.technology/developers', note: 'Official Polygon developer resources; event requirements vary by organiser.' },
  { name: 'Avalanche', role: 'Blockchain ecosystem and technology partner', url: 'https://build.avax.network/', note: 'Official Avalanche builder documentation and tooling.' },
  { name: 'BNB Chain', role: 'Blockchain ecosystem and hackathon organiser', url: 'https://www.bnbchain.org/en/hackathons', note: 'Official BNB Chain hackathon catalogue, tracks, rules, and resources.' },
  { name: 'Aptos', role: 'Blockchain ecosystem and technology partner', url: 'https://aptos.dev/', note: 'Official Aptos developer documentation; event terms come from the named organiser.' },
  { name: 'Sui', role: 'Blockchain ecosystem and technology partner', url: 'https://docs.sui.io/', note: 'Official Sui developer documentation and build guides.' },
  { name: 'Devpost', role: 'Hackathon hosting and submission platform', url: 'https://devpost.com/hackathons', note: 'Event-specific official rules and judging criteria are published by each host.' },
  { name: 'DoraHacks', role: 'Web3 hackathon and developer incentive platform', url: 'https://dorahacks.io/hackathon', note: 'Hosts programme pages, submissions, tracks, and organiser requirements.' },
  { name: 'Mantle', role: 'Blockchain ecosystem and technology partner', url: 'https://www.mantle.xyz/build', note: 'Official Mantle builder resources; verify the current event page before starting.' },
] as const;

export const WINNING_PATTERNS = [
  { name: 'Rules before code', evidence: 'Official organisers define eligibility, permitted prior work, deadlines, required integrations, submission fields, and demos. Missing one can make a strong build ineligible.' },
  { name: 'A working end-to-end demo', evidence: 'Official judging pages repeatedly distinguish functioning prototypes and meaningful integration from intention, wrappers, or static screens.' },
  { name: 'Visible ecosystem use', evidence: 'Partner tracks commonly require judges to locate the integration in the code and understand why that technology is necessary.' },
  { name: 'A specific problem and user', evidence: 'Usefulness, impact, product thinking, and clear problem articulation recur across official judging criteria.' },
  { name: 'Technical execution', evidence: 'Completeness, code quality, integration depth, architecture, and security awareness frequently appear in rubrics.' },
  { name: 'Clear presentation', evidence: 'A concise demo, repository README, architecture explanation, and direct answers make the implementation verifiable in limited judging time.' },
  { name: 'A trustworthy commit trail', evidence: 'ETHGlobal rules explicitly use version control history to distinguish work completed during the event from unverified pre-existing work.' },
] as const;

export const SUBMISSION_CHECKLIST = ['Current official rules and deadline saved', 'Eligible track and prize selected', 'Required technology used meaningfully', 'Public or permitted repository prepared', 'Commit history shows the build window', 'README explains problem, architecture, setup, and integration', 'Working deployment or reproducible local demo', 'Demo video and presentation within the time limit', 'Tests and known limitations documented', 'No private keys, secrets, or production funds exposed'] as const;
