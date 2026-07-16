/**
 * Free + open-source AI runtime injected into user projects so previews work live
 * without requiring a paid key. Pollinations (no key) is the default; BYOK upgrades
 * go through Xroga's authenticated proxy (keys never committed to GitHub).
 */

import { detectAiIntegrationNeeds } from './aiEndpointCatalog.js';
import type { ProjectFile } from '../services/integrations/githubDeploy.js';

/** Browser client — works on GitHub Pages / Vercel static / Xroga sandbox. */
export function liveAiBrowserClientSource(): string {
  return `/*! Xroga Live AI — free endpoints first; BYOK via Xroga Integrations */
(function (global) {
  'use strict';
  var X = global.XrogaLiveAi || {};

  function pollinationsChat(messages, system) {
    var last = '';
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i] && messages[i].role === 'user') { last = String(messages[i].content || ''); break; }
    }
    var prompt = (system ? system + '\\n\\n' : '') + last;
    var url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt.slice(0, 1800)) + '?model=openai';
    return fetch(url, { method: 'GET' }).then(function (r) {
      if (!r.ok) throw new Error('Pollinations ' + r.status);
      return r.text();
    }).then(function (t) { return (t || '').trim() || 'No reply — try again.'; });
  }

  function imageUrl(prompt, w, h) {
    var width = w || 1024, height = h || 576;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(String(prompt || 'abstract').slice(0, 400))
      + '?width=' + width + '&height=' + height + '&nologo=true';
  }

  /** Optional: call Xroga account proxy when page is opened inside Xroga (cookie auth). */
  function xrogaProxyChat(messages, system) {
    var body = JSON.stringify({ messages: messages, system: system || '' });
    return fetch('/api/integrations/live-ai/chat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    }).then(function (r) {
      if (!r.ok) throw new Error('proxy ' + r.status);
      return r.json();
    }).then(function (j) { return String(j.reply || j.content || ''); });
  }

  function xrogaProxySearch(query) {
    return fetch('/api/integrations/live-ai/search', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query, maxResults: 5 }),
    }).then(function (r) {
      if (!r.ok) throw new Error('search ' + r.status);
      return r.json();
    }).then(function (j) { return j.results || []; });
  }

  X.chat = function (messages, opts) {
    opts = opts || {};
    var system = opts.system || 'You are a helpful assistant inside a website built with Xroga.';
    // Prefer free Pollinations so GitHub/Vercel previews work with zero keys.
    // If Xroga proxy is available (same-origin dashboard preview), try it first for BYOK quality.
    var tryProxy = opts.preferXrogaProxy !== false && typeof location !== 'undefined'
      && /xroga\\.(com|dev|localhost)/i.test(location.hostname || '');
    if (tryProxy) {
      return xrogaProxyChat(messages, system).catch(function () {
        return pollinationsChat(messages, system);
      });
    }
    return pollinationsChat(messages, system);
  };

  X.imageUrl = imageUrl;

  X.search = function (query) {
    var tryProxy = typeof location !== 'undefined'
      && /xroga\\.(com|dev|localhost)/i.test(location.hostname || '');
    if (tryProxy) {
      return xrogaProxySearch(query).catch(function () { return []; });
    }
    // Public DuckDuckGo Instant Answer (limited, no key)
    return fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_redirect=1&no_html=1')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var out = [];
        if (data.AbstractText) {
          out.push({ title: data.Heading || 'Result', url: data.AbstractURL || '#', snippet: data.AbstractText });
        }
        (data.RelatedTopics || []).slice(0, 4).forEach(function (t) {
          if (t.Text && t.FirstURL) out.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
        });
        return out;
      })
      .catch(function () { return []; });
  };

  X.speak = function (text) {
    if (!global.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(String(text || ''));
    global.speechSynthesis.speak(u);
  };

  global.XrogaLiveAi = X;
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

/** Wire chatbot form to live free AI (Pollinations). */
export function liveChatbotFormJs(brand: string): string {
  const safe = brand.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `(() => {
  const messages = document.getElementById('messages');
  const history = document.getElementById('history');
  function add(role, text) {
    const d = document.createElement('div');
    d.className = 'bubble ' + (role === 'user' ? 'user' : '');
    d.textContent = text;
    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
  }
  add('bot', 'Hi — I am ${safe}. Live replies use free open AI (Pollinations). Add your own encrypted API key in Xroga → Integrations for faster models.');
  const thread = [];
  document.getElementById('chat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const q = String(fd.get('q') || '').trim();
    if (!q) return;
    add('user', q);
    thread.push({ role: 'user', content: q });
    const li = document.createElement('li');
    li.textContent = q.slice(0, 40);
    history?.appendChild(li);
    e.target.reset();
    add('bot', 'Thinking…');
    const pending = messages.lastElementChild;
    try {
      const reply = await (window.XrogaLiveAi?.chat
        ? window.XrogaLiveAi.chat(thread, { system: 'You are ${safe}, a helpful product assistant.' })
        : Promise.resolve('Live AI client missing — refresh preview.'));
      if (pending) pending.textContent = reply;
      thread.push({ role: 'assistant', content: reply });
    } catch (err) {
      if (pending) pending.textContent = 'Could not reach free AI — check network and retry.';
    }
  });
  document.getElementById('new-chat')?.addEventListener('click', () => {
    messages.innerHTML = '';
    thread.length = 0;
    add('bot', 'New chat started.');
  });
})();`;
}

export function needsLiveAiRuntime(prompt: string): boolean {
  const t = prompt.toLowerCase();
  if (detectAiIntegrationNeeds(prompt).length) return true;
  return /\b(chatbot|ai assistant|search|image gen|voice|llm|gpt)\b/.test(t);
}

/** Append free AI client + optional feature hooks into site JS. */
export function mergeLiveAiIntoJs(js: string, prompt: string): string {
  if (!needsLiveAiRuntime(prompt)) return js;
  const client = liveAiBrowserClientSource();
  const extras: string[] = [];
  if (/\b(image gen|generate image|ai image)\b/i.test(prompt)) {
    extras.push(`
document.querySelectorAll('[data-xroga-ai-image]').forEach((el) => {
  const p = el.getAttribute('data-prompt') || el.getAttribute('alt') || 'product hero';
  if (window.XrogaLiveAi) el.src = window.XrogaLiveAi.imageUrl(p);
});`);
  }
  if (/\b(web search|live search|search the web)\b/i.test(prompt)) {
    extras.push(`
document.getElementById('xroga-search-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get('q');
  const box = document.getElementById('xroga-search-results');
  if (!box || !window.XrogaLiveAi) return;
  box.textContent = 'Searching…';
  const rows = await window.XrogaLiveAi.search(String(q || ''));
  box.innerHTML = rows.length
    ? rows.map((r) => '<a href="' + r.url + '" target="_blank" rel="noopener">' + (r.title || r.url) + '</a><p>' + (r.snippet || '') + '</p>').join('')
    : '<p>No results</p>';
});`);
  }
  return `${client}\n\n${js}\n\n${extras.join('\n')}`;
}

export function liveAiProjectFiles(prompt: string): ProjectFile[] {
  if (!needsLiveAiRuntime(prompt)) return [];
  return [
    {
      path: 'js/xroga-live-ai.js',
      content: liveAiBrowserClientSource(),
    },
    {
      path: 'AI_LIVE.md',
      content: `# Live free AI in this project

This site ships with **working free AI** so the preview is live:

| Feature | Free endpoint | API key? |
|---------|---------------|----------|
| Chat / text | [Pollinations](https://pollinations.ai) text API | No |
| Images | \`image.pollinations.ai\` | No |
| Voice | Browser Web Speech API | No |
| Web search | DuckDuckGo Instant Answer (+ Xroga SearXNG when previewed on xroga.com) | No |

## Bring your own key (encrypted)

1. Open **Xroga → Integrations → AI**
2. Paste your Groq / Gemini / OpenRouter / DeepSeek key
3. Keys are **AES-encrypted in your Xroga account** — never committed to GitHub
4. On xroga.com previews, chat can use your vault key via \`/api/integrations/live-ai/chat\`
5. For Vercel production with your key: copy vars from \`.env.example\` into Vercel → Settings → Environment Variables

Xroga also runs **free SearXNG web research** during builds (platform-side).
`,
    },
  ];
}

/** Ensure index.html loads the live AI client before app script when using split files. */
export function ensureLiveAiScriptTag(html: string): string {
  if (/xroga-live-ai\.js/i.test(html)) return html;
  if (/<script[^>]+src=["']script\.js["']/i.test(html)) {
    return html.replace(
      /<script([^>]*)src=["']script\.js["']([^>]*)>/i,
      '<script src="js/xroga-live-ai.js"></script>\n  <script$1src="script.js"$2>'
    );
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, '  <script src="js/xroga-live-ai.js"></script>\n</body>');
  }
  return html;
}
