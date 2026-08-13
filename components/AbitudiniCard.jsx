"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "elyra:abitudini-log";
const CIRC = 2 * Math.PI * 21;

function oggiLocaleISO() {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function leggiCache() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function scriviCache(cache) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage pieno o non disponibile — la scrittura sul server resta la verità
  }
}

export default function AbitudiniCard() {
  const oggi = useMemo(() => oggiLocaleISO(), []);
  const [definizioni, setDefinizioni] = useState([]);
  const [valori, setValori] = useState(() => leggiCache()[oggi] || {});
  // Dal primo gesto dell'utente in poi, una risposta di lettura partita
  // prima non deve più sovrascrivere un clic appena fatto (Parte 5.3).
  const sporco = useRef(false);

  useEffect(() => {
    fetch("/api/abitudini")
      .then((res) => res.json())
      .then((body) => {
        setDefinizioni(body.definizioni || []);

        const cache = leggiCache();
        for (const riga of body.log || []) {
          if (riga.data === oggi && sporco.current) continue;
          cache[riga.data] = riga.abitudini || {};
        }
        scriviCache(cache);

        if (!sporco.current) setValori(cache[oggi] || {});
      })
      .catch(() => {});
  }, [oggi]);

  async function clic(def) {
    sporco.current = true;

    const valoreAttuale = valori[def.chiave];
    const nuovoValore =
      def.tipo === "contatore"
        ? (valoreAttuale || 0) >= def.obiettivo
          ? 0
          : (valoreAttuale || 0) + 1
        : !valoreAttuale;

    const nuoviValori = { ...valori, [def.chiave]: nuovoValore };
    setValori(nuoviValori);
    const cache = leggiCache();
    cache[oggi] = nuoviValori;
    scriviCache(cache);

    try {
      const res = await fetch("/api/abitudini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chiave: def.chiave }),
      });
      const body = await res.json();
      // Se il salvataggio fallisce, rileggi lo stato vero invece di
      // lasciare a schermo una cosa non salvata (regola 4, Parte 5).
      if (res.ok) {
        setValori(body.abitudini);
        const cacheAggiornata = leggiCache();
        cacheAggiornata[oggi] = body.abitudini;
        scriviCache(cacheAggiornata);
      } else {
        setValori(valori);
      }
    } catch {
      setValori(valori);
    }
  }

  const percentuale =
    definizioni.length === 0
      ? 0
      : Math.round(
          (definizioni.reduce((tot, def) => {
            if (def.tipo === "contatore") {
              return tot + Math.min(1, (valori[def.chiave] || 0) / def.obiettivo);
            }
            return tot + (valori[def.chiave] ? 1 : 0);
          }, 0) /
            definizioni.length) *
            100
        );

  return (
    <section className="card" id="card-abitudini">
      <div className="card-plate">
        <span className="plate-name">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M8 2v3M8 11v3M2 8h3M11 8h3" />
            <circle cx="8" cy="8" r="2.4" />
          </svg>
          Abitudini
        </span>
        <span className="plate-meta">oggi</span>
      </div>
      <div className="card-body">
        <div className="ring-row">
          <svg className="ring" width="52" height="52" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="21" fill="none" stroke="var(--ink-800)" strokeWidth="6" />
            <circle
              cx="26"
              cy="26"
              r="21"
              fill="none"
              stroke="var(--brass)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - percentuale / 100)}
              transform="rotate(-90 26 26)"
            />
          </svg>
          <div className="ring-label">
            completate
            <br />
            <b className="num">{percentuale}%</b>
          </div>
        </div>
        <div className="habit-list">
          {definizioni.length === 0 ? (
            <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>
              Nessuna abitudine configurata nel profilo.
            </div>
          ) : (
            definizioni.map((def) => {
              const valore = valori[def.chiave];
              const fatto = def.tipo === "contatore" ? (valore || 0) > 0 : !!valore;
              return (
                <button
                  type="button"
                  key={def.chiave}
                  className={`habit${fatto ? " done" : ""}`}
                  onClick={() => clic(def)}
                >
                  <span className="chk">{fatto ? "✓" : ""}</span>
                  {def.nome}
                  {def.tipo === "contatore" && (
                    <span className="cnt num">
                      {valore || 0}/{def.obiettivo}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
