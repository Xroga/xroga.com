/** Explicit release identity takes precedence over a CI event's merge SHA. */
export function webReleaseIdentity(environment:Record<string,string|undefined>):string{
  const value=environment.XROGA_RELEASE_SHA??environment.VERCEL_GIT_COMMIT_SHA??environment.GITHUB_SHA;
  return value&&/^[a-f0-9]{7,40}$/i.test(value)?value:'unavailable';
}
