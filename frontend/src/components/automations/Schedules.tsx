"use client";
import { useState } from "react";
import { useDrafts } from "./useDrafts";
import styles from "./automations.module.css";
type Schedule = {
  id: string;
  name: string;
  date: string;
  time: string;
  timezone: string;
  recurrence: string;
  goal: string;
  paused: boolean;
};
const empty: Schedule[] = [];
const valid = (v: unknown): v is Schedule[] =>
  Array.isArray(v) &&
  v.every(
    (s) =>
      s &&
      typeof s.id === "string" &&
      typeof s.name === "string" &&
      typeof s.date === "string" &&
      typeof s.goal === "string" &&
      typeof s.timezone === "string",
  );
const blank = (): Schedule => ({
  id: "",
  name: "",
  date: new Date().toLocaleDateString("en-CA"),
  time: "09:00",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  recurrence: "Once",
  goal: "",
  paused: false,
});
export function Schedules({
  onSelect,
}: {
  onSelect: (text: string, label: string) => void;
}) {
  const drafts = useDrafts("schedules", empty, valid);
  const [form, setForm] = useState<Schedule>(blank);
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [view, setView] = useState("Calendar");
  const [notice, setNotice] = useState("");
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dateKey = (day: number) =>
    `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const occurs = (s: Schedule, day: number) => {
    const date = dateKey(day);
    if (date < s.date) return false;
    if (s.recurrence === "Daily") return true;
    if (s.recurrence === "Weekly")
      return (
        new Date(`${s.date}T12:00`).getDay() ===
        new Date(`${date}T12:00`).getDay()
      );
    if (s.recurrence === "Monthly") return Number(s.date.slice(-2)) === day;
    return date === s.date;
  };
  function save() {
    try {
      Intl.DateTimeFormat("en", { timeZone: form.timezone });
    } catch {
      setNotice("Enter a valid IANA timezone, for example Asia/Karachi.");
      return;
    }
    if (
      drafts.save([
        ...drafts.value.filter((s) => s.id !== form.id),
        { ...form, id: form.id || crypto.randomUUID() },
      ])
    ) {
      setNotice("Schedule draft saved locally. It will not run automatically.");
      setForm(blank());
    }
  }
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2>Work, on your time.</h2>
          <p>
            Calendar and recurrence setup. These local drafts do not alter the
            existing scheduler.
          </p>
        </div>
        <span className={styles.badge}>Scheduling preview</span>
      </div>
      <div className={styles.editorGrid}>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <button
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              ←
            </button>
            <h3>
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <button
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              →
            </button>
            <button
              onClick={() =>
                setView(view === "Calendar" ? "Agenda" : "Calendar")
              }
            >
              {view === "Calendar" ? "Show agenda" : "Show calendar"}
            </button>
          </div>
          {view === "Calendar" ? (
            <div className={styles.calendar}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <small key={d}>{d}</small>
              ))}
              {Array.from({ length: month.getDay() }, (_, i) => (
                <div key={`blank${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => (
                <button
                  key={i}
                  className={styles.day}
                  aria-label={`Schedule on ${dateKey(i + 1)}`}
                  onClick={() =>
                    setForm((f) => ({ ...f, date: dateKey(i + 1) }))
                  }
                >
                  <b>{i + 1}</b>
                  {drafts.value
                    .filter((s) => occurs(s, i + 1))
                    .map((s) => (
                      <small key={s.id}>
                        {s.paused ? "Ⅱ " : "· "}
                        {s.name}
                      </small>
                    ))}
                </button>
              ))}
            </div>
          ) : (
            <div>
              {drafts.value.length ? (
                drafts.value.map((s) => (
                  <button
                    className={styles.row}
                    key={s.id}
                    onClick={() => setForm(s)}
                  >
                    {s.name} · {s.date} {s.time} · {s.timezone} · {s.recurrence}
                  </button>
                ))
              ) : (
                <p>No schedule drafts. Create your first on the right.</p>
              )}
            </div>
          )}
        </div>
        <form
          className={styles.panel}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h3>{form.id ? "Edit schedule" : "New schedule draft"}</h3>
          <label>
            Name
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Outcome
            <textarea
              required
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </label>
          <div className={styles.two}>
            <label>
              Start date
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              Time
              <input
                required
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </label>
          </div>
          <label>
            Timezone
            <input
              required
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </label>
          <label>
            Repeat
            <select
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
            >
              {["Once", "Daily", "Weekly", "Monthly"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button className={styles.primary} disabled={!drafts.ready}>
            Save schedule draft
          </button>
          <button
            type="button"
            disabled
            title="No public scheduling execution contract is available"
          >
            Activate schedule — unavailable
          </button>
        </form>
      </div>
      <p role="status">{drafts.error || notice}</p>
      <div className={styles.grid}>
        {drafts.value.map((s) => (
          <article className={styles.card} key={s.id}>
            <span className={styles.badge}>
              {s.paused ? "Paused draft" : "Draft · not active"}
            </span>
            <h3>{s.name}</h3>
            <p>
              {s.date} · {s.time} {s.timezone} · {s.recurrence}
            </p>
            <div className={styles.toolbar}>
              <button onClick={() => setForm(s)}>Edit</button>
              <button
                onClick={() =>
                  drafts.save(
                    drafts.value.map((x) =>
                      x.id === s.id ? { ...x, paused: !x.paused } : x,
                    ),
                  )
                }
              >
                {s.paused ? "Resume draft" : "Pause draft"}
              </button>
              <button onClick={() => onSelect(s.goal, s.name)}>
                Run once in workspace
              </button>
              <button
                onClick={() =>
                  drafts.save(drafts.value.filter((x) => x.id !== s.id))
                }
              >
                Remove draft
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
