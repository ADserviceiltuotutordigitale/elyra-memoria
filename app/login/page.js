"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || "Password errata.");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Qualcosa è andato storto. Riprova.");
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ width: "100%", maxWidth: 360 }}
      >
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.4" />
              <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
            </svg>
            Elyra — accesso
          </span>
        </div>
        <div className="card-body">
          <label htmlFor="password" style={{ fontSize: 12.5, color: "var(--paper-dim)" }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              background: "var(--ink-850)",
              border: "1px solid var(--line-soft)",
              borderRadius: 7,
              padding: "10px 12px",
              color: "var(--paper)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
            }}
          />
          {error && (
            <div style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-refresh"
            style={{
              justifyContent: "center",
              padding: "10px 12px",
              fontSize: 13,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Verifica…" : "Entra"}
          </button>
        </div>
      </form>
    </main>
  );
}
