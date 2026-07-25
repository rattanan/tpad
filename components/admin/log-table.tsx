"use client";

import { useEffect, useState } from "react";
import styles from "./log-table.module.css";

export default function LogTable({ kind }: { kind: "audit" | "login" }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await fetch(
        `/api/admin/${kind === "audit" ? "audit-logs" : "login-history"}?q=${encodeURIComponent(query)}`,
      );
      const body = await response.json();
      setItems(body.items ?? []);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [kind, query]);

  return (
    <>
      <div className="search-field log-search">
        <input
          aria-label="Search records"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search records..."
        />
      </div>
      <div className={`log-list ${styles.list}`} aria-live="polite">
        {items.map((item) => {
          const activity = String(kind === "audit" ? item.action : item.status);
          const actor = String(kind === "audit" ? item.actorName ?? "System" : item.loginIdentifier);
          const detail = String(
            kind === "audit"
              ? item.targetName ?? item.description ?? "—"
              : `${item.browser ?? "Other"} · ${item.ipAddress ?? "unknown"}`,
          );
          const createdAt = new Date(String(item.createdAt)).toLocaleString();

          return (
            <article key={String(item.id)}>
              <strong className={styles.cell} title={activity}>{activity}</strong>
              <span className={styles.cell} title={actor}>{actor}</span>
              <span className={styles.cell} title={detail}>{detail}</span>
              <time className={styles.cell} title={createdAt}>{createdAt}</time>
            </article>
          );
        })}
        {loading && <p className="empty">Loading records…</p>}
        {!loading && items.length === 0 && <p className="empty">No records match your search.</p>}
      </div>
    </>
  );
}
