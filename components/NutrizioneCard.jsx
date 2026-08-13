"use client";

import { useEffect, useRef, useState } from "react";

export default function NutrizioneCard() {
  const [pasti, setPasti] = useState([]);
  const [obiettivoCalorico, setObiettivoCalorico] = useState(2000);
  const [descrizione, setDescrizione] = useState("");
  const [stimando, setStimando] = useState(false);
  const [erroreStima, setErroreStima] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [bozza, setBozza] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    fetch("/api/nutrizione")
      .then((res) => res.json())
      .then((body) => {
        setPasti(body.pasti || []);
        setObiettivoCalorico(body.obiettivoCalorico || 2000);
      })
      .catch(() => {});
  }, []);

  async function aggiungiPasto(e) {
    e.preventDefault();
    const testo = descrizione.trim();
    if (!testo || stimando) return;

    setStimando(true);
    setErroreStima(null);
    try {
      const res = await fetch("/api/nutrizione/stima", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descrizione: testo }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setPasti(body.pasti);
      setDescrizione("");
    } catch (err) {
      setErroreStima(err.message || "stima non riuscita");
    } finally {
      setStimando(false);
    }
  }

  function apriModifica(pasto) {
    setEditandoId(pasto.id);
    setBozza({
      calorie: pasto.calorie,
      proteine: pasto.proteine,
      carboidrati: pasto.carboidrati,
      grassi: pasto.grassi,
    });
  }

  // Cambiare un macro ricalcola le calorie all'istante con la formula,
  // senza nessuna chiamata (Parte 5.5) — il salvataggio parte comunque,
  // ma in background, e non blocca la vista.
  function cambiaMacro(campo, valoreTesto) {
    const valore = Number(valoreTesto) || 0;
    const nuova = { ...bozza, [campo]: valore };
    nuova.calorie = Math.round(4 * nuova.proteine + 4 * nuova.carboidrati + 9 * nuova.grassi);
    setBozza(nuova);
    setPasti((prev) => prev.map((p) => (p.id === editandoId ? { ...p, ...nuova, stimato: false } : p)));

    fetch("/api/nutrizione/pasto", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editandoId, ...nuova }),
    }).catch(() => {});
  }

  // Cambiare le calorie parte, solo a digitazione conclusa, verso la
  // rotta di ridistribuzione — mai a ogni tasto (regola 2, Parte 5.5).
  function cambiaCalorie(valoreTesto) {
    const valore = Number(valoreTesto) || 0;
    setBozza((prev) => ({ ...prev, calorie: valore }));
    setPasti((prev) => prev.map((p) => (p.id === editandoId ? { ...p, calorie: valore } : p)));

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/nutrizione/ridistribuisci", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editandoId, calorie: valore }),
        });
        const body = await res.json();
        if (res.ok) setPasti(body.pasti);
      } catch {
        // il valore locale resta comunque quello digitato
      }
    }, 600);
  }

  const totali = pasti.reduce(
    (tot, p) => ({
      calorie: tot.calorie + (p.calorie || 0),
      proteine: tot.proteine + (p.proteine || 0),
      carboidrati: tot.carboidrati + (p.carboidrati || 0),
      grassi: tot.grassi + (p.grassi || 0),
    }),
    { calorie: 0, proteine: 0, carboidrati: 0, grassi: 0 }
  );

  return (
    <section className="card" id="card-nutrizione">
      <div className="card-plate">
        <span className="plate-name">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M5 2v6a2 2 0 004 0V2M9 2v12M13 2c-1.5 1-1.5 3.5 0 5" />
          </svg>
          Nutrizione
        </span>
        <span className="plate-meta num">
          {totali.calorie} / {obiettivoCalorico} kcal
        </span>
      </div>
      <div className="card-body">
        <form onSubmit={aggiungiPasto} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="descrivi un pasto — es. petto di pollo con riso"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            disabled={stimando}
            style={{
              flex: 1,
              background: "var(--ink-850)",
              border: "1px solid var(--line-soft)",
              borderRadius: 7,
              padding: "8px 10px",
              color: "var(--paper)",
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
            }}
          />
          <button type="submit" className="btn-refresh" disabled={stimando}>
            {stimando ? "…" : "Aggiungi"}
          </button>
        </form>
        {erroreStima && <div style={{ color: "var(--bad)", fontSize: 11.5 }}>{erroreStima}</div>}

        <div className="macro-row">
          <div className="macro">
            <div className="m-label">Prot</div>
            <div className="m-val num">{totali.proteine}g</div>
          </div>
          <div className="macro">
            <div className="m-label">Carb</div>
            <div className="m-val num">{totali.carboidrati}g</div>
          </div>
          <div className="macro">
            <div className="m-label">Grassi</div>
            <div className="m-val num">{totali.grassi}g</div>
          </div>
        </div>

        <div className="meal-list">
          {pasti.length === 0 ? (
            <div style={{ color: "var(--paper-faint)", fontSize: 12 }}>Ancora nessun pasto oggi.</div>
          ) : (
            pasti.map((p) => (
              <div key={p.id}>
                <button
                  type="button"
                  className="meal"
                  style={{ width: "100%", background: "none", border: "none", padding: "2px 0" }}
                  onClick={() => (editandoId === p.id ? setEditandoId(null) : apriModifica(p))}
                >
                  <time className="num">{p.ora}</time> {p.nome}{" "}
                  {p.stimato && <span className="pill-est">stima</span>}
                  <span className="kcal num">{p.calorie}</span>
                </button>
                {editandoId === p.id && bozza && (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "8px 4px",
                      borderBottom: "1px solid var(--line-soft)",
                    }}
                  >
                    {["proteine", "carboidrati", "grassi"].map((campo) => (
                      <label key={campo} style={{ flex: 1, fontSize: 10, color: "var(--paper-faint)" }}>
                        {campo}
                        <input
                          type="number"
                          value={bozza[campo]}
                          onChange={(e) => cambiaMacro(campo, e.target.value)}
                          style={{
                            width: "100%",
                            background: "var(--ink-850)",
                            border: "1px solid var(--line-soft)",
                            borderRadius: 5,
                            padding: "4px 6px",
                            color: "var(--paper)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                          }}
                        />
                      </label>
                    ))}
                    <label style={{ flex: 1, fontSize: 10, color: "var(--paper-faint)" }}>
                      calorie
                      <input
                        type="number"
                        value={bozza.calorie}
                        onChange={(e) => cambiaCalorie(e.target.value)}
                        style={{
                          width: "100%",
                          background: "var(--ink-850)",
                          border: "1px solid var(--brass-dim)",
                          borderRadius: 5,
                          padding: "4px 6px",
                          color: "var(--paper)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
