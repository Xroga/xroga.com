// Live model harness: the real AgentLoop, the real system prompt and tool list, and the REAL DeepSeek model (through Zurelay), against a SIMULATED layer.
// It answers one question that unit tests cannot: given this task and this page, which tools does the model actually choose? Results are labelled
// "real DeepSeek, simulated page". They are not browser outcomes. Needs ZURELAY_API_KEY in the environment; it is never written to a file or a log.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '@src/agent/loop';
import { agentSystemPrompt } from '@src/agent/prompt';
import { skillsSection } from '@src/agent/skills';
import { startingTools } from '@src/agent/tool-selection';
import { toolsForRun } from '@src/agent/tools';
import { BATCH_TOOL } from '@src/agent/batch-plan';
import { SCRIPT_CONSOLE_TOOL } from '@src/agent/command-surface-adapter';
import { FIND_SKILL_TOOL, READ_SKILL_TOOL } from '@src/agent/skill-catalog';
import { MENU_PATH_TOOL } from '@src/agent/menu-path';
import { DELEGATE_TOOL } from '@src/agent/subagents';
import { CONFIRM_DOWNLOAD_TOOL } from '@src/agent/confirm-download';
import { SITE_ACTION_TOOL } from '@src/agent/site-actions';
import { HTTP_GET_TOOL } from '@src/xroga/plugins';
import { FakeHost, FakeLayer } from '@src/agent/testing/fake-layer';
import type { FakeHandler } from '@src/agent/testing/fake-layer';

export const MODEL = 'deepseek-v4.1-flash-1017';

export interface LiveCall { turn: number; tool: string; summary: string; ms: number; result?: string; input?: unknown }
export interface LiveResult { appNotes: string[]; calls: LiveCall[]; toolsOffered: string[]; modelTurns: number; wallMs: number; inputTokens: number; outputTokens: number; end: string; finalText: string }

export interface Scenario {
  request: string;
  url: string;
  title: string;
  /** What the simulated page's outline says. */
  outline: string;
  handlers?: Record<string, FakeHandler>;
  turnCap?: number;
  siteFetch?: import('@src/agent/well-known-skills').FetchLike;
  onlineSkills?: boolean;
}

export function apiKey(): string | undefined {
  return process.env.ZURELAY_API_KEY || undefined;
}

export async function runLive(s: Scenario): Promise<LiveResult> {
  globalThis.indexedDB = new IDBFactory();
  const key = apiKey();
  if (!key) throw new Error('ZURELAY_API_KEY is not set');
  const chat = createModel({ kind: 'openai-compatible', baseUrl: 'https://api.zurelay.com/v1', modelName: MODEL, apiKey: key, maxOutputTokens: 2048 });
  const profile = resolveProfile({ kind: 'openai-compatible', modelName: MODEL, overrides: { contextWindow: 32_000, maxOutput: 2_048, vision: true } });
  const full = toolsForRun({ pointAt: true, vision: true, localScreenshots: true, agentTools: [DELEGATE_TOOL, BATCH_TOOL, SCRIPT_CONSOLE_TOOL, MENU_PATH_TOOL, FIND_SKILL_TOOL, READ_SKILL_TOOL, CONFIRM_DOWNLOAD_TOOL, HTTP_GET_TOOL, SITE_ACTION_TOOL] });
  const { tools, full: fullTools } = startingTools(full, s.request);
  const names = tools.map(t => t.name);
  const playbooks = skillsSection(s.request);
  const system = agentSystemPrompt({ tools: names }) + (playbooks ? `\n\n${playbooks}` : '');
  const layer = new FakeLayer({
    snapshot: () => ({ ok: true, text: s.outline, page: { tabId: 1, url: s.url, title: s.title, rev: 3 } as never }),
    read: () => ({ ok: true, text: s.outline }),
    ...(s.handlers ?? {}),
  });
  layer.tabsData = { tabs: [{ tabId: 1, url: s.url, title: s.title, active: true }], activeTabId: 1 } as never;
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: s.request }] } });
  const calls: LiveCall[] = [];
  let turn = 0;
  let last = Date.now();
  const t0 = Date.now();
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'live1',
    model: { ref: { providerId: 'live', model: MODEL }, chat, profile, reasoning: 'none' } as never,
    system, tools, fullTools, layer, host: new FakeHost(), signal: AbortSignal.timeout(180_000),
    emit: (event: { type: string; row?: { tool: string; status: string; summary?: string } }) => {
      if (event.type === 'message_start') turn++;
      if (event.type === 'tool_execution_end' && event.row) {
        const row = event.row as unknown as { tool: string; status: string; result?: string; text?: string; output?: string };
        const last = [...calls].reverse().find(c => c.tool === row.tool && c.result === undefined);
        if (last) last.result = `${row.status}: ${String(row.result ?? row.text ?? row.output ?? JSON.stringify(row)).slice(0, 600)}`;
      }
      if (event.type === 'tool_execution_start' && event.row) {
        calls.push({ turn, tool: event.row.tool, summary: String(event.row.summary ?? '').slice(0, 120), ms: Date.now() - last });
        last = Date.now();
      }
    },
    turnCap: s.turnCap ?? 5, siteFetch: s.siteFetch, onlineSkills: s.onlineSkills,
  });
  const end = await loop.run();
  const branch = await activeBranch(c.id);
  const final = [...branch].reverse().find(e => e.type === 'message' && e.message.role === 'assistant');
  const finalText = final && final.type === 'message' ? final.message.parts.map(p => (p.type === 'text' ? p.text : '')).join('').slice(0, 400) : '';
  const appNotes = branch.flatMap(e => (e.type === 'message' && e.appOwned ? e.message.parts.map(p => (p.type === 'text' ? p.text : '')) : [])).filter(Boolean);
  await closeDb();
  return {
    appNotes,
    calls: calls.map(x => ({ ...x })), toolsOffered: names, modelTurns: turn, wallMs: Date.now() - t0,
    inputTokens: 0, outputTokens: 0, end: String(end.outcome ?? end), finalText,
  };
}
