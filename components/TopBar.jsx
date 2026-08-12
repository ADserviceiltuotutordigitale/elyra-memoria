"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/crm", label: "CRM" },
  { href: "/finanze", label: "Finanze" },
  { href: "/review", label: "Review" },
];

// I tre numeri della striscia sono ancora dati d'esempio: diventano
// veri quando la Home (5.1) e il Polso (5.8) leggono dai dati reali.
export default function TopBar() {
  const pathname = usePathname();

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
              6<small>gg</small>
            </span>
          </div>
          <div className="gauge">
            <span className="g-label">Focus</span>
            <span className="g-value" style={{ fontSize: 12 }}>
              RealGuide
            </span>
          </div>
          <div className="gauge">
            <span className="g-label">Patrimonio</span>
            <span className="g-value num up">
              +1,2<small>%</small>
            </span>
          </div>
        </div>
      </header>
    </div>
  );
}
