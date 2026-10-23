"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  employees,
  packs,
  packPrompt,
  type Employee,
  type Pack,
} from "./catalog";
import { useDrafts } from "./useDrafts";
import styles from "./automations.module.css";

const none: Employee[] = [];
const validEmployees = (v: unknown): v is Employee[] =>
  Array.isArray(v) &&
  v.every(
    (e) =>
      e &&
      typeof e.id === "string" &&
      typeof e.name === "string" &&
      typeof e.instructions === "string" &&
      Array.isArray(e.tools),
  );
const emptyEmployee: Employee = {
  id: "",
  name: "",
  category: "Custom",
  description: "",
  instructions: "",
  inputs: "",
  output: "",
  tools: [],
};
export function People({
  onSelect,
}: {
  onSelect: (text: string, label: string) => void;
}) {
  const drafts = useDrafts("employees", none, validEmployees);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [editing, setEditing] = useState(false);
  const [assignment, setAssignment] = useState("");
  const workbench = useRef<HTMLDivElement>(null);
  const selectedId = selected?.id;
  useEffect(() => {
    if (selectedId !== undefined)
      workbench.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selectedId]);
  const catalog = [...employees, ...drafts.value];
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2>Your specialist workforce.</h2>
          <p>
            Choose a responsibility. Xroga verifies the tools and permissions
            when you submit the assignment.
          </p>
        </div>
        <button
          onClick={() => {
            setSelected({ ...emptyEmployee });
            setEditing(true);
          }}
        >
          + Custom employee
        </button>
      </div>
      <div className={styles.toolbar}>
        <input
          aria-label="Search employees"
          placeholder="Search specialists…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Employee category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {["All", ...Array.from(new Set(catalog.map((e) => e.category)))].map(
            (c) => (
              <option key={c}>{c}</option>
            ),
          )}
        </select>
      </div>
      <div className={styles.grid}>
        {catalog
          .filter(
            (e) =>
              (category === "All" || e.category === category) &&
              `${e.name} ${e.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((e) => (
            <button
              className={styles.card}
              key={e.id}
              onClick={() => {
                setSelected({ ...e });
                setEditing(false);
                setAssignment("");
              }}
            >
              <span className={styles.eyebrow}>
                {e.category} ·{" "}
                {e.category === "Custom" ? "Local draft" : "Role template"}
              </span>
              <div className={styles.avatar}>
                {e.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <h3>{e.name}</h3>
              <p>{e.description}</p>
              <span>Explore specialist →</span>
            </button>
          ))}
      </div>
      {selected && (
        <div
          ref={workbench}
          className={styles.workbench}
          aria-label="Employee workbench"
        >
          <div className={styles.sectionHead}>
            <h2>{selected.name || "Create a specialist"}</h2>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close employee workbench"
            >
              ×
            </button>
          </div>
          <div className={styles.two}>
            <form
              className={styles.panel}
              onSubmit={(e) => {
                e.preventDefault();
                if (editing) {
                  const next = {
                    ...selected,
                    id: selected.id.startsWith("custom-")
                      ? selected.id
                      : `custom-${crypto.randomUUID()}`,
                    category: "Custom",
                  };
                  if (
                    drafts.save([
                      ...drafts.value.filter((x) => x.id !== next.id),
                      next,
                    ])
                  ) {
                    setSelected(next);
                    setEditing(false);
                  }
                } else
                  onSelect(
                    `${assignment}\n\nUse this role template: ${selected.name}.\n${selected.instructions}\nDeliverables: ${selected.output}\nVerify tools before acting; do not claim an employee service was installed.`,
                    selected.name,
                  );
              }}
            >
              {editing ? (
                <>
                  <label>
                    Employee name
                    <input
                      required
                      value={selected.name}
                      onChange={(e) =>
                        setSelected({ ...selected, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Responsibility
                    <textarea
                      required
                      value={selected.description}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Instructions
                    <textarea
                      required
                      value={selected.instructions}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          instructions: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Supported inputs
                    <input
                      value={selected.inputs}
                      onChange={(e) =>
                        setSelected({ ...selected, inputs: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Deliverables
                    <input
                      required
                      value={selected.output}
                      onChange={(e) =>
                        setSelected({ ...selected, output: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Proposed capabilities
                    <input
                      value={selected.tools.join(", ")}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          tools: e.target.value.split(",").map((t) => t.trim()),
                        })
                      }
                    />
                  </label>
                  <button className={styles.primary}>
                    Save local employee draft
                  </button>
                </>
              ) : (
                <>
                  <span className={styles.badge}>Assignment workbench</span>
                  <label>
                    What should this employee accomplish?
                    <textarea
                      required
                      value={assignment}
                      onChange={(e) => setAssignment(e.target.value)}
                      placeholder={`Describe a task for your ${selected.name.toLowerCase()}…`}
                    />
                  </label>
                  <button className={styles.primary}>
                    Add assignment to chatbar
                  </button>
                  <button type="button" onClick={() => setEditing(true)}>
                    Customize instructions
                  </button>
                </>
              )}
              <p role="status">{drafts.error}</p>
            </form>
            <aside className={styles.panel}>
              <h3>Capabilities & boundaries</h3>
              <p>{selected.description}</p>
              <h4>Inputs</h4>
              <p>
                {selected.inputs ||
                  "Define the information this specialist may use."}
              </p>
              <h4>Expected outputs</h4>
              <p>{selected.output || "Define verifiable deliverables."}</p>
              <h4>Tools & permissions</h4>
              <p>{selected.tools.join(" · ") || "Chosen after task review"}</p>
              <p>
                Authorized read access only until you approve external changes.
                No autonomous trading, hiring decisions or spending.
              </p>
              <h4>Related Work Packs</h4>
              {packs
                .filter((p) => p.employees.includes(selected.id))
                .map((p) => (
                  <Link key={p.id} href={`#work-packs/${p.id}`}>
                    {p.name} →
                  </Link>
                ))}
              <details>
                <summary>Sample output structure · preview</summary>
                <p>
                  Summary → Findings → Evidence and citations → Proposed next
                  actions → Approval checklist.
                </p>
              </details>
              <h4>Progress & evidence</h4>
              <p>
                No run has started from this workbench. Submit through the
                chatbar to follow real execution in your workspace.
              </p>
              <Link href="#activity">View real activity →</Link>
            </aside>
          </div>
        </div>
      )}
    </section>
  );
}
type SavedPack = {
  id: string;
  choices: Record<string, string>;
  cadence: string;
  goal: string;
};
const emptyPacks: SavedPack[] = [];
const validPacks = (v: unknown): v is SavedPack[] =>
  Array.isArray(v) &&
  v.every(
    (p) =>
      p &&
      typeof p.id === "string" &&
      typeof p.goal === "string" &&
      typeof p.cadence === "string" &&
      p.choices &&
      typeof p.choices === "object" &&
      Object.values(p.choices).every((x) => typeof x === "string"),
  );
export function WorkPacks({
  onSelect,
  initialId,
}: {
  onSelect: (text: string, label: string) => void;
  initialId?: string;
}) {
  const saved = useDrafts("packs", emptyPacks, validPacks);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [availability, setAvailability] = useState("All");
  const [selected, setSelected] = useState<Pack | null>(
    () => packs.find((p) => p.id === initialId) || null,
  );
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [cadence, setCadence] = useState("One-time");
  const [goal, setGoal] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState("");
  const hydrated = useRef(false);
  const setupPanel = useRef<HTMLDivElement>(null);
  const selectedPackId = selected?.id;
  useEffect(() => {
    if (!saved.ready || hydrated.current) return;
    hydrated.current = true;
    const draft = saved.value.find((item) => item.id === initialId);
    if (draft) {
      setChoices(draft.choices);
      setCadence(draft.cadence);
      setGoal(draft.goal);
    }
  }, [saved.ready, saved.value, initialId]);
  useEffect(() => {
    if (selectedPackId)
      setupPanel.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
  }, [selectedPackId]);
  const visible = packs.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      `${p.name} ${p.outcome}`.toLowerCase().includes(query.toLowerCase()) &&
      (availability === "All" ||
        availability === "Preview" ||
        (availability === "Saved drafts" &&
          saved.value.some((x) => x.id === p.id))),
  );
  function open(p: Pack) {
    const draft = saved.value.find((x) => x.id === p.id);
    setSelected(p);
    setChoices(draft?.choices || {});
    setCadence(draft?.cadence || "One-time");
    setGoal(draft?.goal || "");
    setStep(0);
    setReviewed(false);
    setNotice("");
  }
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2>Start with the outcome.</h2>
          <p>
            Complete solutions, thoughtfully assembled. Review the people, plan,
            connections and approvals together.
          </p>
        </div>
        <span className={styles.badge}>{saved.value.length} saved setups</span>
      </div>
      <div className={styles.toolbar}>
        <input
          aria-label="Search work packs"
          placeholder="Research, publish, repair…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Pack category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {["All", ...Array.from(new Set(packs.map((p) => p.category)))].map(
            (c) => (
              <option key={c}>{c}</option>
            ),
          )}
        </select>
        <select
          aria-label="Pack availability"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
        >
          {["All", "Available", "Preview", "Saved drafts"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {!visible.length && (
        <div className={styles.empty}>
          No matching packs. Fully managed pack installation is not enabled; use
          Preview to configure an outcome for the existing workspace.
        </div>
      )}
      <div className={styles.grid}>
        {visible.map((p) => (
          <button className={styles.card} key={p.id} onClick={() => open(p)}>
            <span className={styles.eyebrow}>
              {p.category} ·{" "}
              {saved.value.some((x) => x.id === p.id)
                ? "Saved setup"
                : "Setup preview"}
            </span>
            <h3>{p.name}</h3>
            <p>{p.outcome}</p>
            <small>
              {p.employees.length} specialists · {p.steps.length} steps ·
              Optional schedule
            </small>
            <span>Explore solution →</span>
          </button>
        ))}
      </div>
      {selected && (
        <div
          ref={setupPanel}
          className={styles.workbench}
          aria-label="Work Pack setup"
        >
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>
                Guided setup · frontend preview
              </span>
              <h2>{selected.name}</h2>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close pack setup"
            >
              ×
            </button>
          </div>
          <div className={styles.steps}>
            {["Contents", "Connections", "Permissions & timing", "Review"].map(
              (s, i) => (
                <button
                  key={s}
                  aria-current={step === i ? "step" : undefined}
                  onClick={() => setStep(i)}
                >
                  {i + 1}. {s}
                </button>
              ),
            )}
          </div>
          {step === 0 && (
            <div className={styles.two}>
              <div className={styles.panel}>
                <h3>Proposed workflow</h3>
                <ol className={styles.timeline}>
                  {selected.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              <div className={styles.panel}>
                <h3>Your workforce</h3>
                {selected.employees.map((id) => (
                  <p key={id}>{employees.find((e) => e.id === id)?.name}</p>
                ))}
                <h3>Deliverables</h3>
                {selected.outputs.map((o) => (
                  <p key={o}>✓ {o}</p>
                ))}
                <label>
                  Your outcome
                  <textarea
                    placeholder={selected.outcome}
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className={styles.panel}>
              <p>
                Choose a destination for each role. These preferences do not
                establish a connection. Review actual account status in Plugins.
              </p>
              {selected.roles.map((role) => (
                <div key={role.name} className={styles.row}>
                  <label>
                    {role.name}
                    <select
                      value={choices[role.name] || role.apps[0]}
                      onChange={(e) =>
                        setChoices({ ...choices, [role.name]: e.target.value })
                      }
                    >
                      {role.apps.map((app) => (
                        <option key={app}>{app}</option>
                      ))}
                    </select>
                  </label>
                  <Link
                    href={`/dashboard/integrations/${encodeURIComponent(choices[role.name] || role.apps[0])}`}
                  >
                    Review connection ↗
                  </Link>
                </div>
              ))}
              <p>
                Browser tools are selected by the existing runtime only after
                capability and authorization checks.
              </p>
            </div>
          )}
          {step === 2 && (
            <div className={styles.panel}>
              <h3>Approval boundaries</h3>
              <p>{selected.approval}</p>
              <label>
                Proposed cadence
                <select
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value)}
                >
                  {["One-time", "Daily", "Weekly", "Monthly"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <p>
                Recurring activation is unavailable here. Saving a cadence does
                not schedule or start work.
              </p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />{" "}
                I reviewed the proposed permissions. This is not approval to
                publish, spend or modify production.
              </label>
            </div>
          )}
          {step === 3 && (
            <div className={styles.panel}>
              <h3>Ready for your workspace</h3>
              <p>{goal || selected.outcome}</p>
              <p>
                {cadence} · {selected.employees.length} role templates ·{" "}
                {selected.roles.length} connection roles
              </p>
              <p>
                Connection health and execution eligibility will be checked by
                Xroga. No pack has been installed or executed.
              </p>
              <button
                disabled={!reviewed}
                onClick={() => {
                  if (
                    saved.save([
                      ...saved.value.filter((p) => p.id !== selected.id),
                      { id: selected.id, choices, cadence, goal },
                    ])
                  )
                    setNotice(
                      "Setup saved locally. No execution or recurring schedule was activated.",
                    );
                }}
              >
                Save setup locally
              </button>
              <button
                className={styles.primary}
                disabled={!reviewed}
                onClick={() =>
                  onSelect(packPrompt(selected, choices, goal), selected.name)
                }
              >
                Use this outcome in chatbar
              </button>
              <button disabled title="Pack lifecycle API is not available">
                Activate managed pack — unavailable
              </button>
            </div>
          )}
          <p role="status">{saved.error || notice}</p>
          <div className={styles.toolbar}>
            <button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
            <button
              disabled={step === 3 || (step === 2 && !reviewed)}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
