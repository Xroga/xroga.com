/** Structured hackathon intelligence — sponsor-aligned, not generic web clones */

export interface HackathonPrizeTrack {
  name: string;
  winners: number;
  prize: string;
  criteria: string;
}

export interface HackathonSubmissionStep {
  order: number;
  label: string;
  detail: string;
  required: boolean;
}

export interface HackathonIdeaRecommendation {
  name: string;
  tagline: string;
  targetTrack: string;
  whyNovel: string;
  sponsorGapFilled: string;
  whatToBuild: string[];
  whatNotToBuild: string[];
  demoStory90s: string;
  revenuePath?: string;
}

export interface HackathonBrief {
  id: string;
  name: string;
  sponsor: string;
  ecosystem: string;
  deadline?: string;
  prizePool?: string;
  registrationUrl?: string;
  listingUrl?: string;
  productType: string;
  cryptoRequired: boolean;
  summary: string;
  judgingCriteria: string[];
  prizeTracks: HackathonPrizeTrack[];
  submissionSteps: HackathonSubmissionStep[];
  sponsorGaps: string[];
  rejectReasons: string[];
  innovationSweetSpot: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
  recommendedIdeas: HackathonIdeaRecommendation[];
  recommendedIdea?: HackathonIdeaRecommendation;
  researchedAt: string;
}

export interface HackathonResearchBundle {
  brief: HackathonBrief;
  context: string;
  isHackathon: true;
  chain?: 'solana' | 'ethereum' | 'xlayer' | 'generic';
  buildMode: 'asp' | 'dapp' | 'generic';
}
