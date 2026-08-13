"use client";

import { useEffect, useMemo, useState } from "react";

const GIORNI = ["L", "M", "M", "G", "V", "S", "D"];

function chiaveGiorno(date) {
  // YYYY-MM-DD nel fuso del browser — che è già quello dell'utente,
  // niente bisogno di USER_TIMEZONE qui (Clock.jsx segue la stessa logica).
  return new Intl.DateTimeFormat("en-CA").format(date);
}

function settimanaCorrente() {
  const oggi = new Date();
  const isoWeekday = (oggi.getDay() + 6) % 7; // lunedì = 0 ... domenica = 6
  const lunedi = new Date(oggi);
  lunedi.setDate(oggi.getDate() - isoWeekday);
  lunedi.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunedi);
    d.setDate(lunedi.getDate() + i);
    return d;
  });
}

export default function CalendarioCard() {
  const [eventi, setEventi] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState(null);
  const settimana = useMemo(() => settimanaCorrente(), []);
  const oggiChiave = useMemo(() => chiaveGiorno(new Date()), []);
  const [giornoSelezionato, setGiornoSelezionato] = useState(oggiChiave);

  useEffect(() => {
    fetch("/api/calendario")
      .then((res) => res.json())
      .then((body) => {
        if (body.errore) setErrore(body.errore);
        setEventi(body.eventi || []);
      })
      .catch(() => setErrore("non raggiungibile"))
      .finally(() => setCaricamento(false));
  }, []);

  const eventiPerGiorno = useMemo(() => {
    // Il giorno di ogni evento arriva già calcolato dal server (lib/ical.js),
    // con USER_TIMEZONE: gli eventi tutto-il-giorno non vanno mai fatti
    // passare per una seconda conversione di fuso sul client.
    const mappa = new Map();
    for (const ev of eventi) {
      if (!mappa.has(ev.giorno)) mappa.set(ev.giorno, []);
      mappa.get(ev.giorno).push(ev);
    }
    return mappa;
  }, [eventi]);

  const agendaGiorno = eventiPerGiorno.get(giornoSelezionato) || [];
  const conteggioSettimana = settimana.reduce(
    (tot, d) => tot + (eventiPerGiorno.get(chiaveGiorno(d))?.length || 0),
    0
  );

  return (
    <section className="card" id="card-calendario">
      <div className="card-plate">
        <span className="plate-name">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="2" y="3.5" width="12" height="10.5" rx="1.4" />
            <path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
          </svg>
          Calendario
        </span>
        <span className="plate-meta">
          {caricamento ? "…" : `${conteggioSettimana} impegni`}
        </span>
      </div>
      <div className="card-body">
        <div className="week-strip">
          {settimana.map((d, i) => {
            const chiave = chiaveGiorno(d);
            const isToday = chiave === oggiChiave;
            const isSelected = chiave === giornoSelezionato;
            return (
              <button
                type="button"
                key={chiave}
                className={`week-day${isToday ? " is-today" : ""}`}
                style={isSelected && !isToday ? { borderColor: "var(--paper-dim)" } : undefined}
                onClick={() => setGiornoSelezionato(chiave)}
              >
                {GIORNI[i]}
                <span className="d-num num">{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {errore && (
          <div style={{ color: "var(--warn)", fontSize: 11.5 }}>
            Calendario non disponibile ({errore}).
          </div>
        )}

        {giornoSelezionato === oggiChiave && <div className="now-line" />}

        <div className="agenda">
          {caricamento ? (
            <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>Carico…</div>
          ) : agendaGiorno.length === 0 ? (
            <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>
              Nessun impegno.
            </div>
          ) : (
            agendaGiorno.map((ev) => (
              <div className="agenda-item" key={ev.id}>
                <time className="num">
                  {ev.tuttoIlGiorno
                    ? "—"
                    : new Date(ev.inizio).toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                </time>
                {ev.titolo || "(senza titolo)"}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
