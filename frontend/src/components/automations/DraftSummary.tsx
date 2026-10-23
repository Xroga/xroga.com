"use client";
import { useDrafts } from "./useDrafts";
import { packs } from "./catalog";
import styles from "./automations.module.css";
type Setup = {
  id: string;
  name?: string;
  date?: string;
  time?: string;
  timezone?: string;
  paused?: boolean;
};
const empty: Setup[] = [];
const valid = (value: unknown): value is Setup[] =>
  Array.isArray(value) &&
  value.every((item) => item && typeof item.id === "string");
export function DraftSummary() {
  const setups = useDrafts("packs", empty, valid);
  const schedules = useDrafts("schedules", empty, valid);
  return (
    <div className={`${styles.two} ${styles.draftSummary}`}>
      <section className={styles.panel}>
        <h3>Your saved solutions</h3>
        <p>Local setup drafts — not server installations.</p>
        {setups.value.length ? (
          setups.value.map((item) => (
            <a
              className={styles.row}
              key={item.id}
              href={`#work-packs/${encodeURIComponent(item.id)}`}
            >
              {packs.find((p) => p.id === item.id)?.name || "Saved pack"}{" "}
              <span>Resume setup →</span>
            </a>
          ))
        ) : (
          <p>
            No saved setups yet. <a href="#work-packs">Explore Work Packs →</a>
          </p>
        )}
        <a href="#apps-mcp">Review actually connected apps →</a>
      </section>
      <section className={styles.panel}>
        <h3>Upcoming planned work</h3>
        <p>
          Calendar drafts only. Nothing is scheduled to execute automatically.
        </p>
        {schedules.value
          .filter((s) => !s.paused)
          .sort((a, b) =>
            `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
          )
          .slice(0, 3)
          .map((s) => (
            <a className={styles.row} href="#scheduled-tasks" key={s.id}>
              <span>
                {s.name}
                <small>
                  {s.date} · {s.time} · {s.timezone}
                </small>
              </span>
              <span>Edit →</span>
            </a>
          ))}
        {!schedules.value.length && (
          <a href="#scheduled-tasks">Plan a schedule →</a>
        )}
      </section>
    </div>
  );
}
