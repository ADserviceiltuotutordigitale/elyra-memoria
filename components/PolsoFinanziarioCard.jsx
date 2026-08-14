"use client";

import { useEffect, useState } from "react";

function formattaValuta(numero) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(numero || 0);
}

function Blocco({ etichetta, totale, delta }) {
  return (
    <div className="pulse-blocco">
      <div className="pulse-ambito">{etichetta}</div>
      <div className="pulse-total">
        <span className="amount num">{formattaValuta(totale)}</span>
        {delta !== null && (
          <span className={`delta num ${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? "▲" : "▼"} {formattaValuta(Math.abs(delta))}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PolsoFinanziarioCard() {
  const [istantanea, setIstantanea] = useState(null);
  const [deltaPersonale, setDeltaPersonale] = useState(null);
  const [deltaLavoro, setDeltaLavoro] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [aggiornando, setAggiornando] = useState(false);
  const [errore, setErrore] = useState(null);

  function carica() {
    return fetch("/api/finanze")
      .then((res) => res.json())
      .then((body) => {
        setIstantanea(body.istantanea);
        setDeltaPersonale(body.deltaPersonale);
        setDeltaLavoro(body.deltaLavoro);
      });
  }

  useEffect(() => {
    carica()
      .catch(() => {})
      .finally(() => setCaricamento(false));
  }, []);

  async function aggiorna() {
    setAggiornando(true);
    setErrore(null);
    try {
      const res = await fetch("/api/finanze/aggiorna", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "aggiornamento non riuscito");
      await carica();
    } catch (err) {
      setErrore(err.message);
    } finally {
      setAggiornando(false);
    }
  }

  return (
    <section className="card" id="card-polso">
      <div className="card-plate">
        <span className="plate-name">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M2 12l3.5-5 2.5 3 4-6 2 3" />
          </svg>
          Polso finanziario
        </span>
      </div>
      <div className="card-body">
        {caricamento ? (
          <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>Carico…</div>
        ) : !istantanea ? (
          <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>
            Nessuna istantanea ancora — premi aggiorna per leggere Odoo.
          </div>
        ) : (
          <>
            <div className="pulse-doppio">
              <Blocco etichetta="Personale" totale={istantanea.totale_personale} delta={deltaPersonale} />
              <Blocco etichetta="Lavoro" totale={istantanea.totale_lavoro} delta={deltaLavoro} />
            </div>
            <div className="pulse-bars">
              {istantanea.conti.map((c) => (
                <div className="pbar-row" key={c.nome}>
                  <span className="pbar-label pbar-label-conto">{c.nome}</span>
                  <span className="pbar-val num" style={{ marginLeft: "auto" }}>
                    {formattaValuta(c.saldo)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {errore && <div style={{ color: "var(--bad)", fontSize: 11.5 }}>{errore}</div>}
        <div className="updated-row">
          {istantanea && (
            <>
              aggiornato alle{" "}
              <span className="num">
                {new Date(istantanea.generato_alle).toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </>
          )}
          <button type="button" className="btn-refresh" onClick={aggiorna} disabled={aggiornando}>
            {aggiornando ? "…" : "↻ aggiorna"}
          </button>
        </div>
      </div>
    </section>
  );
}
