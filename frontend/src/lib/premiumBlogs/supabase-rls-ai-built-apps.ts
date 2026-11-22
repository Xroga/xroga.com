import type { GuidePage } from '../seoGrowthContent';
/** Source-reviewed editorial guide. Code and examples are illustrative; verify in real projects. */
export const premiumSupabaseRlsAiBuiltApps: GuidePage = {
  "slug": "supabase-rls-ai-built-apps",
  "title": "Supabase RLS for AI-Built Apps: A Practical Two-User Security Checklist",
  "description": "Use Supabase Row Level Security to protect AI-built app data. Learn policy design, auth.uid checks, two-user testing, service-role boundaries and launch verification.",
  "eyebrow": "Application security · Supabase RLS",
  "intro": "An AI-generated dashboard can look private while its database is not. Row Level Security helps PostgreSQL decide which records each authenticated user may access, even if someone bypasses the interface and calls the API directly.",
  "explain": {
    "quick": "Enable Row Level Security and write policies that compare the signed-in user's identity with allowed records. Test with two independent users and ensure privileged service keys never reach the browser.",
    "simple": "Imagine every customer's records are in locked drawers. Hiding other drawers on the screen is not a lock. RLS checks the lock inside the database every time someone asks for a record.",
    "steps": [
      "Identify which tables contain user or organization data.",
      "Enable RLS and write narrowly scoped policies.",
      "Use stable user IDs and approved membership records.",
      "Test reads and writes using two distinct accounts.",
      "Check service-role secrets and storage permissions before launch."
    ]
  },
  "related": [
    "/build-with/supabase",
    "/security",
    "/blog/build-secure-client-portal-with-ai",
    "/tools/production-readiness-checker"
  ],
  "sources": [
    {
      "label": "Supabase Row Level Security",
      "href": "https://supabase.com/docs/guides/database/postgres/row-level-security"
    },
    {
      "label": "Supabase production security checklist",
      "href": "https://supabase.com/docs/guides/security/production-checklist"
    },
    {
      "label": "Supabase Auth managing user data",
      "href": "https://supabase.com/docs/guides/auth/managing-user-data"
    },
    {
      "label": "Supabase secure data",
      "href": "https://supabase.com/docs/guides/database/secure-data"
    }
  ],
  "sections": [
    {
      "heading": "What Row Level Security actually protects",
      "paragraphs": [
        "RLS is a database feature that evaluates rules when rows are accessed or modified. Supabase exposes PostgreSQL through APIs and client libraries, making correctly configured policies especially important for tables reachable from browsers. A frontend filter is not a substitute: a person can modify a request or call a data endpoint directly.",
        "For example, a request tracker may store tickets for many customers in one table. The UI can show the signed-in customer's tickets, but without proper database authorization another client might request tickets with different IDs. RLS allows the database to deny those cross-user reads and writes according to a declared policy."
      ],
      "bullets": [
        "SELECT policies govern which rows a role can read.",
        "INSERT checks decide whether new rows may be created.",
        "UPDATE policies govern existing rows and allowed resulting values.",
        "DELETE policies govern which rows a role may remove.",
        "Storage objects and related services need their own applicable access rules."
      ]
    },
    {
      "heading": "Authentication and authorization are different",
      "paragraphs": [
        "Supabase Auth can identify the signed-in user and provide a user identifier to database policies. The database still needs to decide which rows that user may see. A successfully authenticated request does not imply authorization to every row in the table.",
        "Use stable user IDs and explicit organization membership when sharing data. Do not rely on an email address from a client request as the sole proof of ownership. A user can change a request payload; authorization decisions need trusted identity context and database-managed relations."
      ]
    },
    {
      "heading": "A simple personal-records policy",
      "paragraphs": [
        "Consider a demo table where every record has an owner_id linked to the authenticated user. The following example illustrates the principle. It is not a complete production migration: you must adapt table names, existing grants, indexes, insert/update requirements and your actual session model before applying it.",
        "The policy below restricts authenticated reads to records whose owner_id matches the current Supabase Auth identity. Separate policies are needed for writing operations. Enable RLS on the table and test with the publishable client credentials and a normal signed-in session, not with a service-role key."
      ],
      "code": {
        "caption": "Illustrative SQL: owner-scoped reads; review for your schema before use",
        "content": "-- Example schema assumption: public.tasks has owner_id uuid.\nALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY \"Users read own tasks\"\nON public.tasks\nFOR SELECT\nTO authenticated\nUSING ((SELECT auth.uid()) = owner_id);\n\n-- Additional INSERT, UPDATE and DELETE policies are required\n-- if the application needs those operations.\n-- Never use a service-role key to test regular-user restrictions."
      }
    },
    {
      "heading": "The two-user test that every AI-built app needs",
      "paragraphs": [
        "Create two independent test accounts, Alice and Bob, and a record owned by each. When Alice signs in, she should retrieve Alice's record but not Bob's. When Bob signs in, the opposite must happen. Repeat the check for create and update operations if your application supports them. A policy that blocks reads but permits arbitrary writes is not enough.",
        "Test through the same client path real users use. A successful query with a privileged database administrator proves little about RLS for ordinary users. Inspect API responses and confirm that an empty result caused by a policy is distinguished from a missing record or connection failure where the interface needs to show a meaningful message."
      ],
      "table": {
        "caption": "Illustrative access matrix for a personal tasks application.",
        "columns": [
          "Request",
          "Alice's session",
          "Bob's session",
          "Expected"
        ],
        "rows": [
          [
            "Read Alice's task",
            "Allowed",
            "Denied",
            "Other users cannot read"
          ],
          [
            "Read Bob's task",
            "Denied",
            "Allowed",
            "Each sees own data"
          ],
          [
            "Update Alice's task",
            "Allowed with policy",
            "Denied",
            "No cross-user writes"
          ],
          [
            "Insert task as another owner",
            "Denied if restricted",
            "Denied if restricted",
            "Ownership is enforced"
          ],
          [
            "Unauthenticated read",
            "Denied",
            "Denied",
            "Public reads are not accidental"
          ]
        ]
      }
    },
    {
      "heading": "Why the service-role key changes everything",
      "paragraphs": [
        "Supabase's service-role or secret key can bypass row-level restrictions, according to the documented role model. That makes it appropriate only for trusted server-side operations that enforce their own authorization. Exposing it through a frontend bundle, a public repository or a client-side environment variable is a severe security mistake.",
        "If you accidentally expose such a key, treat it as an incident rather than only a lint error. Rotate the credential using provider guidance, inspect logs for misuse, review affected data and update the deployment to use a safer design. Never 'fix' a blocked frontend request by switching to a privileged key."
      ]
    },
    {
      "heading": "Multi-tenant applications need membership rules",
      "paragraphs": [
        "Business apps frequently have organizations with multiple users. In that case, owner_id = auth.uid() may be too simple. You may need a membership table that records which user belongs to which organization and what role they hold. A policy can then consult that trusted membership relation rather than a client-supplied organization name.",
        "Design with revocation in mind. If a worker leaves a client organization, removing membership should immediately stop access to its rows. Review how policies interact with inserts, updates, caching and service-role operations. Complex policies should be tested for both correctness and query performance."
      ]
    },
    {
      "heading": "Inspect storage and related resources",
      "paragraphs": [
        "Protecting a table does not necessarily protect documents stored elsewhere. Private file buckets, signed URL issuance, uploads and deletes need access checks tied to the correct user or project. If a document path includes a project ID, the API must still verify that the requesting user is entitled to access that project.",
        "Audit public endpoints, serverless functions and background jobs separately. A privileged backend endpoint can accidentally return another organization's data even when direct table access is restricted. Effective security requires consistent authorization across the entire request path."
      ]
    },
    {
      "heading": "A practical pre-launch RLS verification process",
      "paragraphs": [
        "Before launch, enumerate all tables reachable by the application, identify who should have access and ensure the actual policies reflect those decisions. Record test cases for reading, creating, changing and deleting rows. Include unauthenticated requests and malicious cross-user IDs in the test suite.",
        "After every schema migration, rerun the affected authorization tests. New tables and views may need different policy treatment, and a future feature can introduce a new access path. Keeping policy tests alongside application tests makes permissions part of engineering rather than a one-time setup step."
      ],
      "steps": [
        {
          "title": "Inventory tables and identities",
          "body": "Write down every user-facing data table, its intended roles and owner or tenant relationship."
        },
        {
          "title": "Enable RLS where required",
          "body": "Check actual policies and grants in the Supabase dashboard or migrations."
        },
        {
          "title": "Create negative test accounts",
          "body": "Use distinct synthetic users and records to test cross-user reads and writes."
        },
        {
          "title": "Review privileged paths",
          "body": "Inspect server-only credentials, functions, exports and storage operations."
        },
        {
          "title": "Record results",
          "body": "Save exact tests and failures, then retest after each change."
        }
      ]
    },
    {
      "heading": "Common RLS misconceptions",
      "paragraphs": [
        "People often assume enabling RLS automatically creates all intended policies. It does not. Another mistake is testing only with an administrator or service-role connection, which can bypass the very protections you want to verify. A third mistake is hiding records in the UI and assuming the network layer cannot retrieve them.",
        "Security policy work should use official Supabase documentation and your actual schema. Examples are helpful, but applying them without understanding grants and roles can block valid users or allow unintended operations. Treat a passed manual test as a useful signal, not a certification of the entire system."
      ],
      "note": "The SQL above is an illustrative policy pattern and has not been executed against your database. Review existing grants, schema, policy interactions and negative tests before production changes."
    },
    {
      "heading": "Design write policies, not only read policies",
      "paragraphs": [
        "A SELECT policy can prevent users from reading one another's records, but it does not automatically define safe inserts and updates. If a user can create a row with another person's owner ID, the application may still be vulnerable. Define INSERT WITH CHECK rules that constrain new rows, and review UPDATE rules for both the existing row and the proposed new values.",
        "Consider a task table where owner_id identifies the account that owns a task. A new task should normally be created only with the current user's ID, and a user should not be able to change owner_id to a different account without an explicitly authorized transfer workflow. A suitable UPDATE policy and any supporting constraints should reflect those requirements.",
        "Test writes with two sessions. Attempt to create a task for someone else, alter another user's record ID, or update a row through an API instead of the normal UI. A successful negative test is one where the operation is denied without revealing private data."
      ]
    },
    {
      "heading": "An example of owner-scoped inserts and updates",
      "paragraphs": [
        "The following SQL extends the idea of the earlier SELECT example. It assumes a public.tasks table with owner_id uuid and the right grants for the authenticated role. Adjust schema names, policy names, operations and actual business rules before use. A production multi-tenant application may need a membership lookup instead of personal ownership.",
        "Using auth.uid() as a trusted identity source is different from accepting an arbitrary owner_id from the browser. Policies provide one layer of enforcement, but server-side functions and privileged integrations must still validate their callers. Keep the final policy set in reviewed migrations rather than scattered manual dashboard changes.",
        "Run tests as ordinary users after applying any policy. The SQL editor or service-role connection may bypass protections and is therefore not a substitute for customer-session verification."
      ]
    },
    {
      "heading": "Choose organization membership as the source of truth",
      "paragraphs": [
        "For a team application, multiple people may legitimately access the same project. Model organizations, memberships and roles explicitly instead of giving every record a loose owner email. The database policy should verify membership in the trusted organization relation and, where necessary, the role permitted for that operation.",
        "Think through revocation. If a consultant leaves an organization, removing that membership should prevent subsequent reads and writes. Test the effect on active sessions, cached client data and already issued file links according to the behavior of your stack. Authentication remaining valid does not mean organization authorization remains valid.",
        "Keep policy complexity manageable. Deeply nested membership checks can affect query performance. Evaluate the actual queries, indexes and policy design on a representative test dataset before scaling. Security and performance both matter for usability."
      ]
    },
    {
      "heading": "Storage access and signed links need their own review",
      "paragraphs": [
        "A document row may be protected by RLS while the file itself is stored in a bucket with a different access rule. Make sure storage policies and signed-link issuance consult the same project or organization authorization decisions. A file path should not be accepted as proof that the caller may download the file.",
        "Review expiration and revocation semantics. Short-lived links can reduce exposure, but the exact behavior depends on the storage provider. Do not promise that every previously issued link becomes unusable immediately after removing membership unless the implementation verifies that.",
        "Run negative tests for file listing, download, upload and deletion. For a client portal, user A should not be able to obtain a valid link to user B's private document simply by guessing an object key."
      ]
    },
    {
      "heading": "Monitor policy drift when AI changes the schema",
      "paragraphs": [
        "AI-assisted development can create new tables or columns quickly. Every new user-facing table is a potential access-control boundary. Include a schema review in the pull-request process: does the table have RLS enabled, does it need policies, what roles have grants, and are its foreign keys consistent with organization ownership?",
        "After a migration, run the negative tests again. A renamed column may cause a policy to fail unexpectedly, and a new server endpoint may bypass intended boundaries. Keep authorization acceptance criteria alongside functional tests so these regressions are visible before release.",
        "If a privileged key is accidentally exposed, rotate it and evaluate the impact rather than only removing it from source. Protecting real customer data requires incident response and evidence of containment, not a cosmetic patch."
      ]
    },
    {
      "heading": "Frequently asked questions about Supabase RLS",
      "paragraphs": [
        "These answers clarify what RLS protects and what it does not."
      ],
      "faqs": [
        {
          "question": "Is RLS enough to secure a complete app?",
          "answer": "No. It protects database row access under applicable roles; file storage, server endpoints, secrets, authentication and business logic still require safeguards."
        },
        {
          "question": "Can a logged-in user still be unauthorized?",
          "answer": "Yes. Authentication identifies a user; policies determine whether that user may read or change a specific record."
        },
        {
          "question": "Why do queries work in SQL editor but fail in the app?",
          "answer": "An administrator or privileged role may bypass RLS while regular client roles are restricted. Test with the same role as real users."
        },
        {
          "question": "Should my frontend ever use a service-role key?",
          "answer": "No. Keep privileged keys on trusted server paths and enforce explicit authorization there."
        }
      ]
    }
  ],
  "authorName": "Xroga Editorial",
  "publishedAt": "2026-11-20",
  "updated": "2026-11-20",
  "readingMinutes": 9,
  "visual": {
    "src": "/blog-visuals/supabase-rls-ai-built-apps.svg",
    "alt": "Original editorial diagram explaining supabase rls for ai-built apps: a practical two-user security checklist",
    "caption": "Illustrative workflow for Supabase RLS for AI-Built Apps: A Practical Two-User Security Checklist; not a screenshot of a tested application.",
    "width": 1400,
    "height": 800
  }
};
