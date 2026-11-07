// Chrome serializes this function into an isolated top-frame execution world.
export function readPage(expectedUrl, steps) {
  if (location.href !== expectedUrl || window !== window.top) return { changed: true };
  const supported = ["title", "headings", "links"];
  if (!Array.isArray(steps) || !steps.length || steps.length > supported.length ||
      steps.some((step) => !supported.includes(step))) return { invalid: true };

  const report = Object.fromEntries(steps.map((step) => [step, []]));
  const normalize = (text) => text.replace(/\s+/g, " ").trim().slice(0, 180);
  if (report.title) report.title.push(normalize(document.title));
  if (!report.headings && !report.links) return { report };

  const protectedElement = "form,input,textarea,select,button,[contenteditable],[hidden],[inert],[aria-hidden=true]";
  const root = document.body;
  if (!root) return { report };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const visitedLinks = new Set();
  let scanned = 0;
  const limit = 25;
  while (scanned < 3_000 && walker.nextNode()) {
    scanned++;
    const element = walker.currentNode;
    const isHeading = report.headings?.length < limit && /^H[1-6]$/.test(element.tagName);
    const isLink = report.links?.length < limit && element.tagName === "A";
    if (!isHeading && !isLink) continue;
    if (element.closest(protectedElement) || element.querySelector(protectedElement) ||
        !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const label = normalize(element.innerText);
    if (!label) continue;
    if (isHeading) {
      report.headings.push({ level: Number(element.tagName[1]), label });
      continue;
    }
    const href = element.getAttribute("href");
    if (!href || href.startsWith("#") || element.hasAttribute("download")) continue;
    let destination;
    try {
      destination = new URL(href, document.baseURI);
    } catch {
      continue;
    }
    if (destination.protocol !== "https:" || destination.username || destination.password) continue;
    const url = destination.origin + destination.pathname;
    if (url.length > 500) continue;
    const key = JSON.stringify([label, url]);
    if (visitedLinks.has(key)) continue;
    visitedLinks.add(key);
    report.links.push({ label, url });
  }
  const limited = scanned === 3_000 || (report.headings?.length ?? 0) === limit || (report.links?.length ?? 0) === limit;
  return { report, limited };
}
