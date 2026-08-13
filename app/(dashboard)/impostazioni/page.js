"use client";

import { useRouter } from "next/navigation";

export default function ImpostazioniScreen() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="screen">
      <div className="grid g1">
        <section className="card">
          <div className="card-plate">
            <span className="plate-name">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3l2 1.5" />
              </svg>
              Impostazioni
            </span>
          </div>
          <div className="card-body" style={{ gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Backup</div>
              <div style={{ fontSize: 12.5, color: "var(--paper-dim)", marginBottom: 10 }}>
                Scarica tutti i tuoi dati in un file JSON — è anche la tua via d'uscita: puoi
                lasciare Supabase o Vercel senza ricominciare da zero.
              </div>
              <a
                href="/api/admin/export"
                className="btn-refresh"
                style={{ display: "inline-flex", textDecoration: "none" }}
              >
                ↓ Scarica backup
              </a>
            </div>
            <hr className="rule" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Sessione</div>
              <button type="button" className="btn-refresh btn-danger" onClick={logout}>
                Esci
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
