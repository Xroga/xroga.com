// Node modules the Lighthouse bundle names but never needs when it audits a tab: files, compression, streams. Calling one says so.
const unavailable = name => () => {
  throw new Error(`${name} is not available in the browser`);
};
const stub = new Proxy({}, { get: (_target, key) => (key === 'then' || key === '__esModule' ? undefined : unavailable(String(key))) });
export default stub;
export const createGzip = unavailable('zlib.createGzip');
export const gunzipSync = unavailable('zlib.gunzipSync');
