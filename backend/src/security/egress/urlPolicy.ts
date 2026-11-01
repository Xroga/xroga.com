// One implementation of DNS-pinned credential-free external GET, not a new fetcher.
export { publicHttpsUrl, isPublicAddress, admitPublicTarget, boundedPublicGet, boundedPublicPost } from '../boundedPublicGet.js';
export type { PublicGetOptions, PublicGetResult, PublicGetTransport, PublicPostTransport } from '../boundedPublicGet.js';
