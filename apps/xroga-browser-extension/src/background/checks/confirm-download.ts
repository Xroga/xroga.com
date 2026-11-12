// `confirm_download` against real Chrome: a page starts downloads the way an Export button does (a click on a download
// link), and the tool's own wait reads Chrome's real download list. A finished file is verified with its size; a download
// that never began is not. (Chrome makes no download record at all for an empty blob, so an empty export reads as "no
// download began"; the finished-but-0-bytes case is covered by the unit tests.) Every file the check makes is removed from disk afterwards.
import { judgeDownload, waitForDownload, type DownloadLike } from '@src/agent/confirm-download';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { waitForLoad } from './helpers';

async function remove(id: number): Promise<void> {
  await chrome.downloads.removeFile(id).catch(() => undefined);
  await chrome.downloads.erase({ id }).catch(() => undefined);
}

/** Clicks a download link in the page, as an Export button does. */
async function pageDownload(tabId: number, filename: string, content: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [filename, content],
    func: (name: string, text: string) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
  });
}

const search = async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 25 })) as DownloadLike[];

defineCheck({
  name: 'confirm-download',
  title: 'confirm_download on real page downloads',
  description: 'A page download is verified with its size; an empty one and a missing one are not.',
  async run() {
    const page = await chrome.tabs.create({ url: `${FIXTURE_ORIGIN}/c-text.html`, active: false });
    await waitForLoad(page.id!);
    const made: number[] = [];
    const listener = (item: chrome.downloads.DownloadItem) => made.push(item.id);
    chrome.downloads.onCreated.addListener(listener);
    try {
      const body = 'name,price\nkettle,49.90\nlamp,19.00\n';
      const stamp = Date.now();
      const since = stamp - 1000;

      await pageDownload(page.id!, `nb-confirm-${stamp}.csv`, body);
      const good = await waitForDownload(search, { since, name: `nb-confirm-${stamp}`, waitMs: 15_000 });

      await pageDownload(page.id!, `nb-confirm-empty-${stamp}.csv`, '');
      const empty = await waitForDownload(search, { since, name: `nb-confirm-empty-${stamp}`, waitMs: 15_000 });

      const started = Date.now();
      const never = await waitForDownload(search, { since, name: `nb-never-${stamp}.mp4`, waitMs: 1500 });
      const waited = Date.now() - started;

      const [item] = await search().then(all => all.filter(i => i.filename.includes(`nb-confirm-${stamp}`)));
      const report = {
        verified: good.status === 'verified',
        sizeReported: good.line.includes(`${new TextEncoder().encode(body).length} bytes`),
        realFileSize: item?.fileSize === new TextEncoder().encode(body).length,
        noFolderInLine: !/[A-Za-z]:\\|Users|Downloads/.test(good.line),
        emptyRefused: empty.isError && empty.status !== 'verified',
        emptyStatus: empty.status,
        emptyLine: empty.line,
        missingRefused: never.status === 'not_seen' && never.isError,
        waitedAbout1500: waited >= 1400 && waited < 4000,
        sample: good.line,
        judged: judgeDownload(item).status,
      };
      const failed = Object.entries(report).filter(([, v]) => v === false);
      if (failed.length) throw new Error(JSON.stringify(report));
      return report;
    } finally {
      chrome.downloads.onCreated.removeListener(listener);
      for (const id of made) await remove(id);
      await chrome.tabs.remove(page.id!).catch(() => undefined);
    }
  },
});
