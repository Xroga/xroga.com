/**
 * Verified workflow guidance for working alongside third-party coding assistants.
 * Xroga currently consumes authorized MCP servers; it does not expose a verified
 * public MCP server for external AI agents to call. These are GitHub handoffs,
 * not OAuth/native partnerships with the named agent providers.
 */
export type ExternalAgent = {
  id: string;
  name: string;
  maker: string;
  logoId: string;
  summary: string;
  detail: string;
  workflow: readonly [string, string, string];
  vendorDocumentation: string;
};

export const EXTERNAL_AGENTS: readonly ExternalAgent[] = [
  {
    id: 'codex', name: 'Codex', maker: 'OpenAI', logoId: 'openai',
    summary: 'Move coding work between Codex and Xroga using a shared GitHub repository.',
    detail: 'Codex works on a repository through its own CLI, editor or cloud workflow. Xroga can inspect the authorized GitHub repository and continue scoped development work. There is no native Codex-to-Xroga account connection.',
    workflow: ['Connect a GitHub repository in Xroga', 'Work on that repository with Codex and commit or open a PR', 'Ask Xroga to inspect the changes, run applicable checks or continue the task'],
    vendorDocumentation: 'https://github.com/openai/codex',
  },
  {
    id: 'claude-code', name: 'Claude Code', maker: 'Anthropic', logoId: 'anthropic',
    summary: 'Continue or review Claude Code changes in the same GitHub project.',
    detail: 'Claude Code can work on local code and GitHub. Use its normal git flow; Xroga accesses only the repository you separately authorize. Connecting a Claude MCP client to Xroga directly is not implemented here.',
    workflow: ['Authorize your repository in Xroga', 'Use Claude Code on the same project and publish a branch or PR', 'Have Xroga inspect or continue repository work after review'],
    vendorDocumentation: 'https://docs.anthropic.com/en/docs/claude-code/overview',
  },
  {
    id: 'cursor', name: 'Cursor Agent', maker: 'Cursor', logoId: 'cursor',
    summary: 'Bring editor-agent changes into Xroga through your own repo.',
    detail: 'Cursor can work with Git repositories and MCP servers, but Xroga has not published a compatible inbound MCP endpoint. The supported handoff here is through your authorized GitHub source.',
    workflow: ['Link the GitHub project to Xroga', 'Use Cursor Agent in your local or hosted project, then push a branch', 'Review and continue the source changes using Xroga'],
    vendorDocumentation: 'https://cursor.com/docs/mcp',
  },
  {
    id: 'copilot', name: 'GitHub Copilot', maker: 'GitHub', logoId: 'githubcopilot',
    summary: 'Coordinate GitHub issues and pull requests with Xroga.',
    detail: 'Copilot can work in supported GitHub repositories and IDEs. Xroga can analyze the same authorized repository and prepare reviewable edits; this is not a direct Copilot API connector.',
    workflow: ['Connect GitHub to Xroga', 'Use Copilot to prepare code changes or a pull request', 'Review that branch or task with Xroga before merging'],
    vendorDocumentation: 'https://docs.github.com/en/copilot',
  },
  {
    id: 'gemini-cli', name: 'Gemini CLI', maker: 'Google', logoId: 'googlegemini',
    summary: 'Use Gemini CLI for local work and Xroga for repository handoff.',
    detail: 'Gemini CLI supports MCP servers in its own environment. Xroga does not currently expose a verified Gemini-to-Xroga MCP server. GitHub remains the common source handoff.',
    workflow: ['Authorize the GitHub repository in Xroga', 'Make or review changes with Gemini CLI and push your branch', 'Ask Xroga to inspect repository context and continue safely'],
    vendorDocumentation: 'https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html',
  },
  {
    id: 'cline', name: 'Cline', maker: 'Cline', logoId: 'cline',
    summary: 'Share reviewed repository changes between Cline and Xroga.',
    detail: 'Cline supports local and remote MCP tools, but that does not establish direct compatibility with Xroga as a server. GitHub branches are the documented handoff path on this page.',
    workflow: ['Connect your repository in Xroga', 'Use Cline to make and commit scoped changes', 'Ask Xroga to review the diff and continue the authorized project'],
    vendorDocumentation: 'https://github.com/cline/cline/blob/main/docs/mcp/mcp-overview.mdx',
  },
] as const;

export const EXTERNAL_AGENT_DISCLOSURE =
  'These are independent third-party products. Workflows use your separately authorized GitHub repositories, not direct agent-to-Xroga OAuth, API access, or an inbound Xroga MCP server. Review permissions and changes before merging.';
