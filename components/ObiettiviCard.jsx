"use client";

import { useEffect, useState } from "react";

function Sezione({ titolo, chiave, voci, onAggiungi, onToggle, onRimuovi }) {
  const [testo, setTesto] = useState("");

  function submit(e) {
    e.preventDefault();
    const valore = testo.trim();
    if (!valore) return;
    onAggiungi(chiave, valore);
    setTesto("");
  }

  return (
    <div className="goal-group">
      <h4>{titolo}</h4>
      {voci.map((v) => (
        <div key={v.id} className={`goal${v.fatto ? " done" : ""}`} style={{ position: "relative" }}>
          <button
            type="button"
            className="chk"
            style={{ background: "none", padding: 0 }}
            onClick={() => onToggle(chiave, v)}
            aria-label={v.fatto ? "segna da fare" : "segna fatto"}
          />
          <span className="g-text">{v.testo}</span>
          {v.progresso && (
            <span className="g-prog num">
              {v.progresso.corrente}/{v.progresso.totale}
            </span>
          )}
          <button
            type="button"
            className="goal-remove"
            onClick={() => onRimuovi(chiave, v.id)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "var(--paper-faint)",
              fontSize: 12,
              padding: "0 2px",
            }}
            aria-label="rimuovi"
          >
            ✕
          </button>
        </div>
      ))}
      <form onSubmit={submit}>
        <input
          type="text"
          className="goal-add"
          placeholder="+ aggiungi"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
        />
      </form>
    </div>
  );
}

export default function ObiettiviCard() {
  const [settimana, setSettimana] = useState([]);
  const [mese, setMese] = useState([]);

  useEffect(() => {
    fetch("/api/obiettivi")
      .then((res) => res.json())
      .then((body) => {
        setSettimana(body.settimana || []);
        setMese(body.mese || []);
      })
      .catch(() => {});
  }, []);

  function applica(body) {
    setSettimana(body.settimana || []);
    setMese(body.mese || []);
  }

  async function aggiungi(sezione, testo) {
    const res = await fetch("/api/obiettivi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sezione, testo }),
    });
    applica(await res.json());
  }

  async function toggle(sezione, voce) {
    // risposta immediata, poi la scrittura (regola 4, Parte 5)
    const aggiorna = (lista) =>
      lista.map((v) => (v.id === voce.id ? { ...v, fatto: !v.fatto } : v));
    if (sezione === "settimana") setSettimana(aggiorna(settimana));
    else setMese(aggiorna(mese));

    const res = await fetch("/api/obiettivi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sezione, id: voce.id, patch: { fatto: !voce.fatto } }),
    });
    if (res.ok) applica(await res.json());
  }

  async function rimuovi(sezione, id) {
    const res = await fetch("/api/obiettivi", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sezione, id }),
    });
    applica(await res.json());
  }

  return (
    <section className="card" id="card-obiettivi">
      <div className="card-plate">
        <span className="plate-name">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M8 2a6 6 0 100 12 6 6 0 000-12z" />
            <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
          </svg>
          Obiettivi
        </span>
      </div>
      <div className="card-body">
        <Sezione
          titolo="Questa settimana"
          chiave="settimana"
          voci={settimana}
          onAggiungi={aggiungi}
          onToggle={toggle}
          onRimuovi={rimuovi}
        />
        <Sezione
          titolo="Questo mese"
          chiave="mese"
          voci={mese}
          onAggiungi={aggiungi}
          onToggle={toggle}
          onRimuovi={rimuovi}
        />
      </div>
    </section>
  );
}
