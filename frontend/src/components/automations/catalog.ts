export const sections = [
  ["overview", "Overview"],
  ["workflows", "Workflows"],
  ["scheduled-tasks", "Scheduled Tasks"],
  ["ai-employees", "AI Employees"],
  ["work-packs", "Work Packs"],
  ["browser-automation", "Browser Automation"],
  ["apps-mcp", "Apps & MCP"],
  ["activity", "Live Activity"],
  ["run-history", "Run History"],
] as const;
export type Section = (typeof sections)[number][0];
export type Employee = {
  id: string;
  name: string;
  category: string;
  description: string;
  inputs: string;
  output: string;
  instructions: string;
  tools: string[];
};
const employee = (
  id: string,
  name: string,
  category: string,
  description: string,
  inputs: string,
  output: string,
  tools: string[],
): Employee => ({
  id,
  name,
  category,
  description,
  inputs,
  output,
  tools,
  instructions: `${description} Cite evidence, state limitations, and request approval before external changes.`,
});
export const employees: Employee[] = [
  employee(
    "code",
    "Code Builder",
    "Engineering",
    "Build software and prepare reviewable changes.",
    "Repository and requirements",
    "Implementation, tests and change summary",
    ["GitHub"],
  ),
  employee(
    "qa",
    "QA & Repair Engineer",
    "Engineering",
    "Investigate failures, prepare fixes and verify behavior.",
    "Application URL, source and acceptance criteria",
    "Defect report and verified repair summary",
    ["Browser", "GitHub"],
  ),
  employee(
    "browser",
    "Browser QA Specialist",
    "Web testing",
    "Exercise real user journeys and collect evidence.",
    "Authorized URL and test scope",
    "Journey trace and reproduction steps",
    ["Browser"],
  ),
  employee(
    "seo",
    "SEO Researcher",
    "Marketing",
    "Research search opportunities and evidence-backed content.",
    "Topic, audience and website",
    "Keyword brief, sources and content recommendations",
    ["Search data", "Browser"],
  ),
  employee(
    "writer",
    "Content Writer",
    "Marketing",
    "Turn a researched brief into an original publication-ready draft.",
    "Brief, voice and source material",
    "Article, outline and editorial checklist",
    ["Documents"],
  ),
  employee(
    "trading",
    "Trading Researcher",
    "Finance",
    "Research markets, risks and scenarios. Never place trades.",
    "Market, horizon and questions",
    "Scenario report with risks and citations",
    ["Market data"],
  ),
  employee(
    "intake",
    "Intake Analyst",
    "Operations",
    "Classify requests and draft appropriate responses.",
    "Authorized requests or inbox",
    "Triage summary and response drafts",
    ["Email", "CRM"],
  ),
  employee(
    "reliability",
    "Reliability Engineer",
    "Engineering",
    "Investigate system health and reliability risks.",
    "Logs, metrics and service context",
    "Incident analysis and recovery proposal",
    ["Monitoring", "GitHub"],
  ),
  employee(
    "market",
    "Market Scout",
    "Research",
    "Track market developments and compare competitors.",
    "Companies, questions and time range",
    "Cited comparison report",
    ["Browser"],
  ),
  employee(
    "data",
    "Data Steward",
    "Data",
    "Identify duplicate records and data-quality issues.",
    "Authorized dataset and quality rules",
    "Quality report and proposed corrections",
    ["Sheets", "Database"],
  ),
];
export type Pack = {
  id: string;
  name: string;
  category: string;
  outcome: string;
  employees: string[];
  steps: string[];
  roles: { name: string; apps: string[] }[];
  outputs: string[];
  approval: string;
};
const pack = (
  id: string,
  name: string,
  category: string,
  outcome: string,
  staff: string[],
  steps: string[],
  roles: Pack["roles"],
  outputs: string[],
): Pack => ({
  id,
  name,
  category,
  outcome,
  employees: staff,
  steps,
  roles,
  outputs,
  approval:
    "Publishing, sending, paid, destructive and production actions require explicit approval. Read access is limited to authorized sources.",
});
export const packs: Pack[] = [
  pack(
    "seo-blog",
    "SEO Blog → Publish",
    "Content",
    "Research, write, SEO-optimize, review and prepare a blog for approved publication.",
    ["seo", "writer", "qa"],
    [
      "Understand topic and audience",
      "Research sources and search opportunities",
      "Create outline and original article",
      "Review facts and SEO requirements",
      "Prepare publishing draft",
      "Request publishing approval",
      "Publish when authorized and verify URL",
    ],
    [
      { name: "Publishing destination", apps: ["wordpress", "webflow"] },
      { name: "Document workspace", apps: ["googledocs", "notion"] },
      { name: "Search and SEO data", apps: ["googlesearchconsole", "semrush"] },
    ],
    [
      "Article draft",
      "Sources and SEO checklist",
      "Verified publication URL when authorized",
    ],
  ),
  pack(
    "website-qa",
    "Website QA & Repair",
    "Engineering",
    "Test a website, document defects and prepare verified repairs.",
    ["browser", "qa"],
    [
      "Define test scope",
      "Exercise user journeys",
      "Document evidence",
      "Propose repairs",
      "Approve changes",
      "Re-test",
    ],
    [{ name: "Repository", apps: ["github"] }],
    ["Defect report", "Repair summary"],
  ),
  pack(
    "saas",
    "SaaS Build & Launch",
    "Engineering",
    "Build, test and prepare a SaaS application for launch.",
    ["code", "qa"],
    [
      "Plan requirements",
      "Implement",
      "Test",
      "Review deployment",
      "Approve launch",
    ],
    [
      { name: "Source control", apps: ["github"] },
      { name: "Hosting", apps: ["vercel"] },
    ],
    ["Source changes", "Test evidence", "Launch plan"],
  ),
  pack(
    "seo",
    "SEO Opportunity Research",
    "Marketing",
    "Find evidence-backed search opportunities for my website.",
    ["seo", "market"],
    [
      "Define audience",
      "Research demand",
      "Compare competitors",
      "Prioritize opportunities",
    ],
    [{ name: "Search data", apps: ["googlesearchconsole", "semrush"] }],
    ["Opportunity report", "Content brief"],
  ),
  pack(
    "repurpose",
    "Content Repurposing",
    "Content",
    "Turn an existing article into useful channel-specific drafts.",
    ["writer"],
    [
      "Read source",
      "Adapt for each channel",
      "Review claims",
      "Request publishing approval",
    ],
    [
      { name: "Source documents", apps: ["notion", "googledocs"] },
      { name: "Destination", apps: ["linkedin", "wordpress"] },
    ],
    ["Channel drafts", "Editorial checklist"],
  ),
  pack(
    "support",
    "Customer Support Triage",
    "Operations",
    "Classify incoming support requests and draft replies.",
    ["intake"],
    [
      "Read authorized requests",
      "Classify urgency",
      "Draft responses",
      "Request approval before sending",
    ],
    [
      { name: "Support inbox", apps: ["gmail", "zendesk"] },
      { name: "Customer records", apps: ["hubspot"] },
    ],
    ["Triage queue", "Reply drafts"],
  ),
  pack(
    "sales",
    "Sales Research & CRM",
    "Operations",
    "Research accounts and propose accurate CRM updates.",
    ["market", "data"],
    [
      "Research public sources",
      "Check existing records",
      "Prepare changes",
      "Approve updates",
    ],
    [{ name: "CRM", apps: ["hubspot", "salesforce"] }],
    ["Account briefs", "Proposed CRM updates"],
  ),
  pack(
    "meeting",
    "Meeting Preparation",
    "Productivity",
    "Prepare a concise briefing from authorized calendar and documents.",
    ["intake", "market"],
    [
      "Review meeting context",
      "Find relevant documents",
      "Prepare agenda and briefing",
    ],
    [
      { name: "Calendar", apps: ["googlecalendar"] },
      { name: "Documents", apps: ["googledrive", "notion"] },
    ],
    ["Meeting brief", "Discussion agenda"],
  ),
  pack(
    "commerce",
    "E-commerce Operations",
    "Operations",
    "Review orders, inventory and business performance.",
    ["data", "intake"],
    [
      "Collect authorized data",
      "Check anomalies",
      "Prepare recommendations",
      "Approve any corrections",
    ],
    [
      { name: "Store", apps: ["shopify"] },
      { name: "Reports", apps: ["googlesheets"] },
    ],
    ["Operations report", "Exception list"],
  ),
  pack(
    "weekly",
    "Weekly Business Report",
    "Productivity",
    "Summarize business performance and prepare a weekly update.",
    ["data", "writer"],
    ["Collect metrics", "Analyze changes", "Draft summary", "Approve delivery"],
    [
      { name: "Business data", apps: ["googlesheets", "hubspot"] },
      { name: "Delivery", apps: ["slack", "gmail"] },
    ],
    ["Weekly report", "Source references"],
  ),
  pack(
    "market",
    "Market Intelligence",
    "Research",
    "Monitor competitors and explain meaningful changes.",
    ["market"],
    ["Choose sources", "Research changes", "Compare evidence", "Write report"],
    [{ name: "Research archive", apps: ["notion", "googledrive"] }],
    ["Market briefing", "Citations"],
  ),
  pack(
    "recruiting",
    "Recruiting Operations",
    "Operations",
    "Organize approved applicant information for human review.",
    ["intake", "data"],
    [
      "Review approved sources",
      "Extract relevant information",
      "Prepare review packet",
      "Human decision",
    ],
    [{ name: "Documents", apps: ["googledrive"] }],
    ["Review packet", "Source index"],
  ),
  pack(
    "cleanup",
    "Data Quality Cleanup",
    "Data",
    "Find duplicates and propose safe data-quality corrections.",
    ["data"],
    [
      "Profile dataset",
      "Detect duplicates",
      "Preview corrections",
      "Approve changes",
      "Verify results",
    ],
    [{ name: "Dataset", apps: ["googlesheets", "supabase"] }],
    ["Quality report", "Change preview"],
  ),
];
export const combinations = [
  {
    name: "Content Publishing",
    apps: ["googledocs", "wordpress", "slack"],
    pack: "seo-blog",
  },
  {
    name: "Software Delivery",
    apps: ["github", "vercel", "slack"],
    pack: "saas",
  },
  {
    name: "CRM Operations",
    apps: ["gmail", "hubspot", "googlesheets"],
    pack: "sales",
  },
  {
    name: "Customer Support",
    apps: ["zendesk", "hubspot", "slack"],
    pack: "support",
  },
  {
    name: "Research",
    apps: ["googledrive", "notion", "googlesheets"],
    pack: "market",
  },
];
export function statusGroup(status: string) {
  if (
    ["completed", "complete", "success", "succeeded", "done"].includes(status)
  )
    return "completed";
  if (["failed", "error", "cancelled", "canceled"].includes(status))
    return "failed";
  if (/approval|awaiting_approval/.test(status)) return "approval-needed";
  if (/paused|stopped|blocked/.test(status)) return "paused";
  if (["queued", "pending"].includes(status)) return "queued";
  if (
    [
      "running",
      "planning",
      "building",
      "reviewing",
      "testing",
      "verifying",
      "executing",
    ].includes(status)
  )
    return "running";
  return "unknown";
}
export function packPrompt(
  pack: Pack,
  choices: Record<string, string>,
  goal = "",
) {
  return `${goal || pack.outcome}\n\nProposed work pack: ${pack.name}\nSpecialists: ${pack.employees.map((id) => employees.find((e) => e.id === id)?.name || id).join(", ")}\nPlan: ${pack.steps.join(" → ")}\nPreferred connections: ${pack.roles.map((role) => `${role.name}: ${choices[role.name] || role.apps[0]}`).join("; ")}. Verify account connections and capabilities before use.\nOutputs: ${pack.outputs.join("; ")}\n${pack.approval}`;
}
