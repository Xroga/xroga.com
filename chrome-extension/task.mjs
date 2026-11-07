const operations = {
  title: /\b(?:page title|title of (?:this|the) page)\b/,
  headings: /\b(?:headings|outline)\b/,
  links: /\blinks\b/,
};

export const operationLabels = {
  title: "Page title",
  headings: "Visible headings",
  links: "Visible link labels and destinations",
};

export function planTask(input) {
  const request = input.trim().toLowerCase().replace(/[.!?]$/, "");
  const verb = /^(?:please )?(?:show(?: me)?|collect|list|extract|read|get|summarize)\s+/;
  if (request.length > 250 || !verb.test(request)) {
    throw new Error("Try “Collect the headings and links” or “Show the page title.”");
  }
  const subjects = request.replace(verb, "")
    .replace(/\s+(?:on|from|in)\s+(?:this|the active|the current)\s+(?:page|tab)$/, "")
    .replace(/^(?:the |all |visible )+/, "")
    .split(/\s*(?:,\s*(?:and\s+)?|\band\b)\s*/);
  const steps = [];
  for (const subject of subjects) {
    const normalized = subject.replace(/^(?:the |all |visible )+/, "");
    const step = Object.keys(operations).find((name) => {
      const match = operations[name].exec(normalized);
      return match?.[0] === normalized;
    });
    if (!step) throw new Error("This version reads the page title, headings and links. Use one or more of those in your request.");
    if (!steps.includes(step)) steps.push(step);
  }
  return steps;
}

export function eligiblePage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.replace(/\.$/, "");
    if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") ||
        /\.(?:localhost|local|internal|home\.arpa)$/.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}
