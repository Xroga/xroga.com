/** Phase 3 economic engine constants */

export const REFERRAL = {
  instantAiTokens: 250_000,
  instantXrg: 5_000,
  retentionAiTokens: 190_000,
  retentionXrg: 5_000,
  retentionMonths: 3,
  referrerDiscountPerReferral: 1,
  maxReferrerDiscount: 15,
  newUserLifetimeDiscount: 3,
} as const;

export const COMMUNITY_POOL = {
  requestAmount: 50_000,
  maxPerMonth: 100_000,
  maxRequestsPerMonth: 2,
  eligibilityRemainingBelow: 500_000,
  minAccountAgeDays: 30,
  initialBalance: 5_000_000,
} as const;

export const TOKEN_DISTRIBUTION = {
  rolloverPercent: 25,
  sharePercent: 25,
  platformReservePercent: 25,
  communityPoolPercent: 10,
  heavyUsersPercent: 5,
  activeBuildersPercent: 10,
} as const;
