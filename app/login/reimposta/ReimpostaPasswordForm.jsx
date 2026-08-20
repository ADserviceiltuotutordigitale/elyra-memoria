"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const campoStile = {
  background: "var(--ink-850)",
  border: "1px solid var(--line-soft)",
  borderRadius: 7,
  padding: "10px 12px",
  color: "var(--paper)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
};

const wrapStile = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

export default function ReimpostaPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [conferma, setConferma] = useState("");
  const [error, setError] = useState("");
  const [fatto, setFatto] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== conferma) {
      setError("Le due password non coincidono.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reimposta-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || "Qualcosa è andato storto.");
        setLoading(false);
        return;
      }
      setFatto(true);
    } catch {
      setError("Qualcosa è andato storto. Riprova.");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main style={wrapStile}>
        <div className="card" style={{ width: "100%", maxWidth: 360 }}>
          <div className="card-body">
            <p style={{ fontSize: 13.5 }}>Link non valido.</p>
          </div>
        </div>
      </main>
    );
  }

  if (fatto) {
    return (
      <main style={wrapStile}>
        <div className="card" style={{ width: "100%", maxWidth: 360 }}>
          <div className="card-body">
            <p style={{ fontSize: 13.5, marginBottom: 10 }}>Password aggiornata.</p>
            <Link
              href="/login"
              className="btn-refresh"
              style={{ display: "inline-flex", textDecoration: "none" }}
            >
              Torna al login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={wrapStile}>
      <form onSubmit={handleSubmit} className="card" style={{ width: "100%", maxWidth: 360 }}>
        <div className="card-plate">
          <span className="plate-name">Nuova password</span>
        </div>
        <div className="card-body" style={{ gap: 10 }}>
          <div>
            <label htmlFor="password" style={{ fontSize: 12.5, color: "var(--paper-dim)" }}>
              Nuova password
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...campoStile, width: "100%", marginTop: 4 }}
            />
          </div>
          <div>
            <label htmlFor="conferma" style={{ fontSize: 12.5, color: "var(--paper-dim)" }}>
              Conferma password
            </label>
            <input
              id="conferma"
              type="password"
              value={conferma}
              onChange={(e) => setConferma(e.target.value)}
              style={{ ...campoStile, width: "100%", marginTop: 4 }}
            />
          </div>
          {error && <div style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</div>}
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
            {loading ? "Aggiornamento…" : "Aggiorna password"}
          </button>
        </div>
      </form>
    </main>
  );
}
