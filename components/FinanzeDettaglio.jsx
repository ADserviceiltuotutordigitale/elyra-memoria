"use client";

import { useEffect, useState } from "react";

function formattaValuta(numero) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(numero || 0);
}

function formattaDataBreve(dataISO) {
  const [, m, d] = dataISO.split("-");
  return `${d}/${m}`;
}

// Ogni linea è normalizzata sul proprio min/max: personale e lavoro hanno
// scale molto diverse (migliaia contro centinaia), e l'obiettivo è vedere
// l'andamento di ciascuna, non confrontare le due altezze fra loro.
function costruisciPunti(valori, larghezza, altezza, margine) {
  if (valori.length === 0) return "";
  if (valori.length === 1) {
    const y = altezza / 2;
    return `${margine},${y} ${larghezza - margine},${y}`;
  }
  const min = Math.min(...valori);
  const max = Math.max(...valori);
  const range = max - min;
  const passo = (larghezza - margine * 2) / (valori.length - 1);
  return valori
    .map((v, i) => {
      const x = margine + i * passo;
      // Nessuna variazione nella serie: linea centrata, non appiattita in
      // basso (il fallback "range || 1" mandava tutti i punti a y=altezza,
      // facendo sovrapporre due serie piatte anche con valori diversi).
      const y = range === 0
        ? altezza / 2
        : altezza - margine - ((v - min) / range) * (altezza - margine * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function GraficoStorico({ storico }) {
  const larghezza = 600;
  const altezza = 160;
  const margine = 12;

  if (storico.length === 0) {
    return (
      <div style={{ color: "var(--paper-faint)", fontSize: 12.5, padding: "24px 0" }}>
        Nessuno storico ancora — torna qui dopo qualche aggiornamento nei prossimi giorni.
      </div>
    );
  }

  const puntiPersonale = costruisciPunti(
    storico.map((s) => s.totale_personale),
    larghezza,
    altezza,
    margine
  );
  const puntiLavoro = costruisciPunti(
    storico.map((s) => s.totale_lavoro),
    larghezza,
    altezza,
    margine
  );

  return (
    <div>
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: "100%", height: "auto" }}>
        <polyline points={puntiPersonale} fill="none" stroke="var(--brass)" strokeWidth="2" />
        <polyline points={puntiLavoro} fill="none" stroke="var(--paper-dim)" strokeWidth="2" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--paper-faint)" }}>
        <span>{formattaDataBreve(storico[0].data)}</span>
        {storico.length > 1 && <span>{formattaDataBreve(storico[storico.length - 1].data)}</span>}
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 11, marginTop: 6 }}>
        <span style={{ color: "var(--brass)" }}>● Personale</span>
        <span style={{ color: "var(--paper-dim)" }}>● Lavoro</span>
      </div>
    </div>
  );
}

function Totale({ etichetta, totale, delta }) {
  return (
    <div style={{ flex: 1 }}>
      <div className="pulse-ambito">{etichetta}</div>
      <div className="pulse-total">
        <span className="amount num" style={{ fontSize: 34 }}>
          {formattaValuta(totale)}
        </span>
        {delta !== null && (
          <span className={`delta num ${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? "▲" : "▼"} {formattaValuta(Math.abs(delta))}
          </span>
        )}
      </div>
    </div>
  );
}

function ContiPerAmbito({ etichetta, conti }) {
  if (conti.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="pulse-ambito">{etichetta}</div>
      <div className="pulse-bars">
        {conti.map((c) => (
          <div className="pbar-row" key={c.nome}>
            <span className="pbar-label" style={{ width: "auto", flex: 1 }}>
              {c.nome}
            </span>
            <span className="pbar-val num">{formattaValuta(c.saldo)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FinanzeDettaglio() {
  const [istantanea, setIstantanea] = useState(null);
  const [deltaPersonale, setDeltaPersonale] = useState(null);
  const [deltaLavoro, setDeltaLavoro] = useState(null);
  const [storico, setStorico] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [aggiornando, setAggiornando] = useState(false);
  const [errore, setErrore] = useState(null);

  function carica() {
    return Promise.all([
      fetch("/api/finanze").then((res) => res.json()),
      fetch("/api/finanze/storico").then((res) => res.json()),
    ]).then(([polso, storicoBody]) => {
      setIstantanea(polso.istantanea);
      setDeltaPersonale(polso.deltaPersonale);
      setDeltaLavoro(polso.deltaLavoro);
      setStorico(storicoBody.storico || []);
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
    <section className="card span-2" id="card-finanze">
      <div className="card-plate">
        <span className="plate-name">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M2 12l3.5-5 2.5 3 4-6 2 3" />
          </svg>
          Finanze
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
            <div style={{ display: "flex", gap: 32 }}>
              <Totale etichetta="Personale" totale={istantanea.totale_personale} delta={deltaPersonale} />
              <Totale etichetta="Lavoro" totale={istantanea.totale_lavoro} delta={deltaLavoro} />
            </div>

            <GraficoStorico storico={storico} />

            <ContiPerAmbito
              etichetta="Personale"
              conti={istantanea.conti.filter((c) => c.ambito === "personale")}
            />
            <ContiPerAmbito
              etichetta="Lavoro"
              conti={istantanea.conti.filter((c) => c.ambito === "lavoro")}
            />
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
