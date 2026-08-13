"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/crm", label: "CRM" },
  { href: "/finanze", label: "Finanze" },
  { href: "/review", label: "Review" },
];

export default function TopBar() {
  const pathname = usePathname();
  const [riepilogo, setRiepilogo] = useState(null);

  useEffect(() => {
    fetch("/api/riepilogo")
      .then((res) => res.json())
      .then(setRiepilogo)
      .catch(() => {});
  }, []);

  return (
    <div className="topbar-container">
      <header className="topbar">
        <div className="brand">
          <span className="mark">◈</span> ELYRA <span className="sub">memoria</span>
        </div>
        <nav className="tabs">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tab${pathname === tab.href ? " active" : ""}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <div className="ledger" aria-label="strumenti rapidi">
          <div className="gauge">
            <span className="g-label">Streak</span>
            <span className="g-value num up">
              {riepilogo ? riepilogo.streak : "—"}
              <small>gg</small>
            </span>
          </div>
          <div className="gauge">
            <span className="g-label">Focus</span>
            <span className="g-value" style={{ fontSize: 12 }}>
              {riepilogo?.focus || "—"}
            </span>
          </div>
          <div className="gauge">
            <span className="g-label">Patrimonio</span>
            <span
              className={`g-value num${
                riepilogo?.deltaPercento != null ? (riepilogo.deltaPercento >= 0 ? " up" : " down") : ""
              }`}
            >
              {riepilogo?.deltaPercento != null
                ? `${riepilogo.deltaPercento >= 0 ? "+" : ""}${riepilogo.deltaPercento.toFixed(1)}`
                : "—"}
              <small>%</small>
            </span>
          </div>
        </div>
        <Link
          href="/impostazioni"
          aria-label="Impostazioni"
          style={{ color: "var(--paper-faint)", display: "flex", padding: "6px 2px" }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1.5v2M8 12.5v2M2.6 4.6l1.4 1.4M12 10l1.4 1.4M1.5 8h2M12.5 8h2M2.6 11.4L4 10M12 6l1.4-1.4" />
          </svg>
        </Link>
      </header>
    </div>
  );
}
