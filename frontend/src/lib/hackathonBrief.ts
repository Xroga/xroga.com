/** Optional Phase-1 research brief shape (no UI card — type only for API payloads). */
export interface HackathonBriefCardData {
  title?: string;
  summary?: string;
  tracks?: string[];
  ideas?: string[];
  risks?: string[];
  sources?: Array<{ title?: string; url?: string }>;
}
