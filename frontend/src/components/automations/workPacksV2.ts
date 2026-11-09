// Proposed Xroga Work Packs. Composio capability and account checks happen at runtime.
// These are user-facing templates, not independently deployed automation programs.
export type CuratedWorkPack = {id:string; title:string; description:string; requiredApps:readonly string[];};
export const curatedWorkPacks: CuratedWorkPack[] = [
  {
    "id": "blog-publishing",
    "title": "Blog Publishing",
    "description": "Turn an approved document into a WordPress post.",
    "requiredApps": [
      "googledocs",
      "wordpress"
    ]
  },
  {
    "id": "editorial-approval",
    "title": "Editorial Approval",
    "description": "Review and approve content before publication.",
    "requiredApps": [
      "notion",
      "slack",
      "wordpress"
    ]
  },
  {
    "id": "newsletter-publishing",
    "title": "Newsletter Publishing",
    "description": "Prepare and send approved email newsletters.",
    "requiredApps": [
      "googledocs",
      "mailchimp"
    ]
  },
  {
    "id": "multi-social-publishing",
    "title": "Multi-Social Publishing",
    "description": "Prepare and publish approved posts across channels.",
    "requiredApps": [
      "notion",
      "linkedin",
      "twitter"
    ]
  },
  {
    "id": "creative-approval",
    "title": "Creative Approval",
    "description": "Coordinate creative files, reviews and sign-off.",
    "requiredApps": [
      "canva",
      "googledrive",
      "slack"
    ]
  },
  {
    "id": "seo-issue-tracker",
    "title": "SEO Issue Tracker",
    "description": "Convert verified Search Console findings into tasks.",
    "requiredApps": [
      "googlesearchconsole",
      "linear",
      "slack"
    ]
  },
  {
    "id": "marketing-performance",
    "title": "Marketing Performance",
    "description": "Combine search, ads and traffic reports into a digest.",
    "requiredApps": [
      "googleanalytics",
      "googlesearchconsole",
      "googleads",
      "googlesheets",
      "slack"
    ]
  },
  {
    "id": "advertising-review",
    "title": "Advertising Review",
    "description": "Analyze campaign spending and share a review.",
    "requiredApps": [
      "googleads",
      "googlesheets",
      "slack"
    ]
  },
  {
    "id": "lead-capture-automation",
    "title": "Lead Capture Automation",
    "description": "Capture form submissions and create CRM records.",
    "requiredApps": [
      "typeform",
      "hubspot"
    ]
  },
  {
    "id": "marketing-asset-library",
    "title": "Marketing Asset Library",
    "description": "Organize approved campaign materials and creative assets.",
    "requiredApps": [
      "canva",
      "googledrive",
      "notion"
    ]
  },
  {
    "id": "email-to-crm",
    "title": "Email to CRM",
    "description": "Summarize customer conversations and prepare CRM updates.",
    "requiredApps": [
      "gmail",
      "hubspot"
    ]
  },
  {
    "id": "lead-qualification",
    "title": "Lead Qualification",
    "description": "Qualify form inquiries and update the sales tracker.",
    "requiredApps": [
      "typeform",
      "hubspot",
      "googlesheets"
    ]
  },
  {
    "id": "sales-follow-up",
    "title": "Sales Follow-Up",
    "description": "Prepare personalized follow-up drafts for review.",
    "requiredApps": [
      "hubspot",
      "gmail"
    ]
  },
  {
    "id": "client-handoff",
    "title": "Client Handoff",
    "description": "Hand off won deals and approved delivery requirements.",
    "requiredApps": [
      "hubspot",
      "googledrive",
      "notion",
      "slack"
    ]
  },
  {
    "id": "sales-meeting-preparation",
    "title": "Sales Meeting Preparation",
    "description": "Prepare sales briefs using meetings, email and CRM.",
    "requiredApps": [
      "googlecalendar",
      "hubspot",
      "gmail"
    ]
  },
  {
    "id": "sales-pipeline-updates",
    "title": "Sales Pipeline Updates",
    "description": "Identify stalled deals and update sales dashboards.",
    "requiredApps": [
      "hubspot",
      "googlesheets",
      "slack"
    ]
  },
  {
    "id": "support-ticket-triage",
    "title": "Support Ticket Triage",
    "description": "Classify incoming tickets and prepare responses.",
    "requiredApps": [
      "zendesk"
    ]
  },
  {
    "id": "critical-support-escalation",
    "title": "Critical Support Escalation",
    "description": "Escalate urgent support issues to engineering.",
    "requiredApps": [
      "zendesk",
      "jira",
      "slack"
    ]
  },
  {
    "id": "customer-support-context",
    "title": "Customer Support Context",
    "description": "Bring customer and order context into support cases.",
    "requiredApps": [
      "zendesk",
      "hubspot",
      "shopify"
    ]
  },
  {
    "id": "support-knowledge-updates",
    "title": "Support Knowledge Updates",
    "description": "Turn repeated questions into reviewed help articles.",
    "requiredApps": [
      "zendesk",
      "notion",
      "slack"
    ]
  },
  {
    "id": "refund-review",
    "title": "Refund Review",
    "description": "Investigate refund requests and prepare approval decisions.",
    "requiredApps": [
      "zendesk",
      "shopify",
      "stripe",
      "slack"
    ]
  },
  {
    "id": "pull-request-review",
    "title": "Pull Request Review",
    "description": "Summarize PR activity and coordinate review tasks.",
    "requiredApps": [
      "github",
      "linear",
      "slack"
    ]
  },
  {
    "id": "deployment-coordination",
    "title": "Deployment Coordination",
    "description": "Verify deployments and prepare team updates.",
    "requiredApps": [
      "github",
      "vercel",
      "slack"
    ]
  },
  {
    "id": "bug-investigation",
    "title": "Bug Investigation",
    "description": "Link error reports with engineering tasks.",
    "requiredApps": [
      "sentry",
      "github",
      "linear"
    ]
  },
  {
    "id": "full-release-management",
    "title": "Full Release Management",
    "description": "Coordinate code, releases, milestones and notices.",
    "requiredApps": [
      "github",
      "vercel",
      "linear",
      "notion",
      "slack"
    ]
  },
  {
    "id": "incident-response",
    "title": "Incident Response",
    "description": "Organize production incidents, owners and status updates.",
    "requiredApps": [
      "sentry",
      "github",
      "linear",
      "slack"
    ]
  },
  {
    "id": "product-changelog",
    "title": "Product Changelog",
    "description": "Draft customer-facing release notes from completed work.",
    "requiredApps": [
      "github",
      "notion",
      "slack"
    ]
  },
  {
    "id": "product-specification-to-tasks",
    "title": "Product Specification to Tasks",
    "description": "Turn product requirements into tracked tasks.",
    "requiredApps": [
      "notion",
      "github",
      "linear"
    ]
  },
  {
    "id": "sprint-review",
    "title": "Sprint Review",
    "description": "Summarize progress, open blockers and sprint outcomes.",
    "requiredApps": [
      "linear",
      "github",
      "slack"
    ]
  },
  {
    "id": "release-calendar",
    "title": "Release Calendar",
    "description": "Coordinate release dates, milestones and team updates.",
    "requiredApps": [
      "github",
      "linear",
      "googlecalendar",
      "slack"
    ]
  },
  {
    "id": "research-knowledge-base",
    "title": "Research Knowledge Base",
    "description": "Organize approved source documents into a knowledge base.",
    "requiredApps": [
      "googledrive",
      "notion"
    ]
  },
  {
    "id": "team-research-brief",
    "title": "Team Research Brief",
    "description": "Prepare sourced answers and share a research summary.",
    "requiredApps": [
      "googledrive",
      "notion",
      "slack"
    ]
  },
  {
    "id": "customer-feedback-analysis",
    "title": "Customer Feedback Analysis",
    "description": "Analyze responses and prioritize customer feedback.",
    "requiredApps": [
      "typeform",
      "googlesheets",
      "notion"
    ]
  },
  {
    "id": "board-presentation",
    "title": "Board Presentation",
    "description": "Compile approved data into presentation drafts.",
    "requiredApps": [
      "googledrive",
      "googlesheets",
      "googleslides"
    ]
  },
  {
    "id": "competitor-research-digest",
    "title": "Competitor Research Digest",
    "description": "Organize existing competitive research and update teams.",
    "requiredApps": [
      "googlesheets",
      "notion",
      "slack"
    ]
  },
  {
    "id": "meeting-preparation",
    "title": "Meeting Preparation",
    "description": "Prepare an agenda from upcoming events and correspondence.",
    "requiredApps": [
      "googlecalendar",
      "gmail",
      "notion"
    ]
  },
  {
    "id": "meeting-notes-to-tasks",
    "title": "Meeting Notes to Tasks",
    "description": "Turn authorized meeting notes into assigned actions.",
    "requiredApps": [
      "zoom",
      "notion",
      "asana"
    ]
  },
  {
    "id": "decision-tracking",
    "title": "Decision Tracking",
    "description": "Turn approved decisions into assigned tasks.",
    "requiredApps": [
      "notion",
      "asana",
      "slack"
    ]
  },
  {
    "id": "daily-priority-assistant",
    "title": "Daily Priority Assistant",
    "description": "Summarize tasks and calendar commitments for the day.",
    "requiredApps": [
      "asana",
      "googlecalendar",
      "slack"
    ]
  },
  {
    "id": "meeting-follow-up",
    "title": "Meeting Follow-Up",
    "description": "Prepare meeting follow-up drafts and CRM next steps.",
    "requiredApps": [
      "googlecalendar",
      "gmail",
      "hubspot"
    ]
  },
  {
    "id": "order-exception-alerts",
    "title": "Order Exception Alerts",
    "description": "Detect problematic orders and notify operations.",
    "requiredApps": [
      "shopify",
      "slack"
    ]
  },
  {
    "id": "order-support-assistant",
    "title": "Order Support Assistant",
    "description": "Use order details to help resolve support tickets.",
    "requiredApps": [
      "shopify",
      "zendesk"
    ]
  },
  {
    "id": "inventory-monitoring",
    "title": "Inventory Monitoring",
    "description": "Flag low-stock products and share reports.",
    "requiredApps": [
      "shopify",
      "googlesheets",
      "slack"
    ]
  },
  {
    "id": "customer-retention-campaign",
    "title": "Customer Retention Campaign",
    "description": "Prepare audience-specific customer retention campaigns.",
    "requiredApps": [
      "shopify",
      "hubspot",
      "mailchimp"
    ]
  },
  {
    "id": "revenue-reporting",
    "title": "Revenue Reporting",
    "description": "Consolidate commerce and payment data for reporting.",
    "requiredApps": [
      "shopify",
      "stripe",
      "googlesheets",
      "slack"
    ]
  },
  {
    "id": "invoice-follow-ups",
    "title": "Invoice Follow-Ups",
    "description": "Prepare overdue invoice reminders for approval.",
    "requiredApps": [
      "quickbooks",
      "gmail"
    ]
  },
  {
    "id": "payment-reconciliation",
    "title": "Payment Reconciliation",
    "description": "Compare invoice and payment records and flag discrepancies.",
    "requiredApps": [
      "stripe",
      "quickbooks",
      "googlesheets"
    ]
  },
  {
    "id": "expense-approval",
    "title": "Expense Approval",
    "description": "Review expense documents and prepare approval records.",
    "requiredApps": [
      "googledrive",
      "quickbooks",
      "slack"
    ]
  },
  {
    "id": "interview-coordination",
    "title": "Interview Coordination",
    "description": "Coordinate interviews and hiring-team communication.",
    "requiredApps": [
      "greenhouse",
      "googlecalendar",
      "gmail",
      "slack"
    ]
  },
  {
    "id": "employee-onboarding",
    "title": "Employee Onboarding",
    "description": "Prepare onboarding tasks, documents and orientation events.",
    "requiredApps": [
      "bamboohr",
      "googledrive",
      "googlecalendar",
      "slack",
      "notion"
    ]
  }
];
export const curatedAppNames: Record<string,string> = {
  "googledocs": "Google Docs",
  "wordpress": "WordPress",
  "slack": "Slack",
  "notion": "Notion",
  "mailchimp": "Mailchimp",
  "linkedin": "LinkedIn",
  "twitter": "X",
  "canva": "Canva",
  "googledrive": "Google Drive",
  "googlesearchconsole": "Google Search Console",
  "linear": "Linear",
  "googleanalytics": "Google Analytics",
  "googleads": "Google Ads",
  "googlesheets": "Google Sheets",
  "typeform": "Typeform",
  "hubspot": "HubSpot",
  "gmail": "Gmail",
  "googlecalendar": "Google Calendar",
  "zendesk": "Zendesk",
  "jira": "Jira",
  "shopify": "Shopify",
  "stripe": "Stripe",
  "github": "GitHub",
  "vercel": "Vercel",
  "sentry": "Sentry",
  "googleslides": "Google Slides",
  "zoom": "Zoom",
  "asana": "Asana",
  "quickbooks": "QuickBooks",
  "greenhouse": "Greenhouse",
  "bamboohr": "BambooHR"
};
