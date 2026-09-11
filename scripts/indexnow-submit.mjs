import { readFile } from 'node:fs/promises';

const host = 'xroga.com';
const origin = `https://${host}`;
const key = process.env.INDEXNOW_KEY?.trim();
const keyLocation = process.env.INDEXNOW_KEY_LOCATION?.trim();
if (!key || !keyLocation) {
  console.error('IndexNow submission skipped: INDEXNOW_KEY and INDEXNOW_KEY_LOCATION are required.');
  process.exit(2);
}
if (!keyLocation.startsWith(`${origin}/`)) {
  console.error('IndexNow submission refused: key location must be hosted on xroga.com.');
  process.exit(2);
}

const requested = process.argv.slice(2);
if (requested.length === 0) {
  console.error('IndexNow submission requires one or more changed xroga.com paths.');
  process.exit(2);
}
const urlList = requested.map((value) => new URL(value, origin)).filter((url) => url.origin === origin).map((url) => url.href);
if (urlList.length !== requested.length || new Set(urlList).size !== urlList.length) {
  console.error('IndexNow submission refused: provide unique xroga.com URLs only.');
  process.exit(2);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation, urlList }),
  signal: AbortSignal.timeout(15_000),
});
if (![200, 202].includes(response.status)) {
  console.error(`IndexNow submission failed with HTTP ${response.status}.`);
  process.exit(1);
}
console.log(`IndexNow accepted ${urlList.length} changed URL(s) with HTTP ${response.status}.`);
