"use client";

import { useEffect, useState } from "react";

function formattaValuta(numero, valuta) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: valuta || "EUR",
    maximumFractionDigits: 0,
  }).format(numero || 0);
}

function totalePerTipo(categorie, tipo) {
  return (categorie || []).filter((c) => c.tipo === tipo).reduce((t, c) => t + (c.valore || 0), 0);
}

export default function PolsoFinanziarioCard() {
  const [istantanea, setIstantanea] = useState(null);
  const [delta, setDelta] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [aggiornando, setAggiornando] = useState(false);
  const [errore, setErrore] = useState(null);

  function carica() {
    return fetch("/api/finanze")
      .then((res) => res.json())
      .then((body) => {
        setIstantanea(body.istantanea);
        setDelta(body.delta);
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

  const liquidita = totalePerTipo(istantanea?.categorie, "liquidita");
  const investito = totalePerTipo(istantanea?.categorie, "investito");
  const debiti = totalePerTipo(istantanea?.categorie, "debito");
  const maxBarra = Math.max(liquidita, investito, debiti, 1);

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
            Nessuna istantanea ancora — premi aggiorna per leggere il foglio.
          </div>
        ) : (
          <>
            <div className="pulse-total">
              <span className="amount num">{formattaValuta(istantanea.patrimonio_netto, istantanea.valuta)}</span>
              {delta !== null && (
                <span className={`delta num ${delta >= 0 ? "up" : "down"}`}>
                  {delta >= 0 ? "▲" : "▼"} {formattaValuta(Math.abs(delta), istantanea.valuta)}
                </span>
              )}
            </div>
            <div className="pulse-bars">
              <div className="pbar-row">
                <span className="pbar-label">Liquidità</span>
                <div className="pbar-track">
                  <div className="pbar-fill" style={{ width: `${(liquidita / maxBarra) * 100}%` }} />
                </div>
                <span className="pbar-val num">{formattaValuta(liquidita, istantanea.valuta)}</span>
              </div>
              <div className="pbar-row">
                <span className="pbar-label">Investito</span>
                <div className="pbar-track">
                  <div className="pbar-fill" style={{ width: `${(investito / maxBarra) * 100}%` }} />
                </div>
                <span className="pbar-val num">{formattaValuta(investito, istantanea.valuta)}</span>
              </div>
              <div className="pbar-row">
                <span className="pbar-label">Debiti</span>
                <div className="pbar-track">
                  <div className="pbar-fill debt" style={{ width: `${(debiti / maxBarra) * 100}%` }} />
                </div>
                <span className="pbar-val num">{formattaValuta(debiti, istantanea.valuta)}</span>
              </div>
            </div>
            {istantanea.note && (
              <div style={{ fontSize: 11, color: "var(--warn)" }}>{istantanea.note}</div>
            )}
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
