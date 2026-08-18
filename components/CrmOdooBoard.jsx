"use client";

import { useCallback, useEffect, useState } from "react";

const VISTA_STORAGE_KEY = "elyra:crm-vista";

function formattaValuta(numero) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(numero || 0);
}

function classePriorita(p) {
  if (p === "3") return "hot";
  if (p === "2") return "warm";
  return "";
}

export default function CrmOdooBoard() {
  const [stages, setStages] = useState([]);
  const [opportunita, setOpportunita] = useState([]);
  const [vista, setVista] = useState("kanban");
  const [caricamento, setCaricamento] = useState(true);
  const [pannelloId, setPannelloId] = useState(null);
  const [faseSelezionata, setFaseSelezionata] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);

  const carica = useCallback(() => {
    return fetch("/api/crm/pipeline")
      .then((res) => res.json())
      .then((body) => {
        setStages(body.stages || []);
        setOpportunita(body.opportunita || []);
      });
  }, []);

  useEffect(() => {
    carica().finally(() => setCaricamento(false));
    const salvata = localStorage.getItem(VISTA_STORAGE_KEY);
    if (salvata) setVista(salvata);
  }, [carica]);

  useEffect(() => {
    localStorage.setItem(VISTA_STORAGE_KEY, vista);
  }, [vista]);

  const opportunitaCorrente = opportunita.find((o) => o.id === pannelloId) || null;

  useEffect(() => {
    setFaseSelezionata(opportunitaCorrente ? opportunitaCorrente.stageId : null);
  }, [opportunitaCorrente?.id]);

  function chiudiPannello() {
    setPannelloId(null);
  }

  async function spostaFase(opportunitaId, nuovoStageId) {
    setOpportunita((prev) =>
      prev.map((o) => (o.id === opportunitaId ? { ...o, stageId: nuovoStageId } : o))
    );
    try {
      await fetch(`/api/crm/pipeline/${opportunitaId}/fase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: nuovoStageId }),
      });
    } finally {
      await carica();
    }
  }

  async function salvaFaseDaPannello() {
    if (!opportunitaCorrente || faseSelezionata === opportunitaCorrente.stageId) return;
    setSalvando(true);
    try {
      await spostaFase(opportunitaCorrente.id, faseSelezionata);
    } finally {
      setSalvando(false);
    }
  }

  function opportunitaVisibili() {
    const q = query.trim().toLowerCase();
    if (!q) return opportunita;
    return opportunita.filter(
      (o) =>
        o.titolo.toLowerCase().includes(q) || (o.cliente || "").toLowerCase().includes(q)
    );
  }

  function opportunitaPerFase(stageId) {
    return opportunitaVisibili().filter((o) => o.stageId === stageId);
  }

  const gruppiCliente = (() => {
    const visibili = opportunitaVisibili();
    const mappa = new Map();
    for (const o of visibili) {
      const chiave = o.cliente || "";
      if (!mappa.has(chiave)) mappa.set(chiave, []);
      mappa.get(chiave).push(o);
    }
    const gruppi = Array.from(mappa.entries())
      .filter(([nome]) => nome !== "")
      .sort((a, b) => a[0].localeCompare(b[0]));
    const senzaCliente = mappa.get("") || [];
    return senzaCliente.length ? [...gruppi, ["Senza cliente", senzaCliente]] : gruppi;
  })();

  return (
    <>
      <section className="card" id="card-crm">
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="8" cy="5.5" r="2.6" />
              <path d="M2.5 14c1-3.2 3.3-4.8 5.5-4.8s4.5 1.6 5.5 4.8" />
            </svg>
            CRM
          </span>
          <span className="plate-meta">pipeline Odoo</span>
        </div>
        <div className="card-body">
          <div className="crm-toolbar">
            <div className="view-switch">
              <button
                type="button"
                className={vista === "kanban" ? "active" : ""}
                onClick={() => setVista("kanban")}
              >
                Kanban
              </button>
              <button
                type="button"
                className={vista === "cliente" ? "active" : ""}
                onClick={() => setVista("cliente")}
              >
                Per cliente
              </button>
            </div>
            <div className="nl-search">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M13.5 13.5L10.5 10.5" />
              </svg>
              <input
                type="text"
                placeholder="cerca per titolo o cliente"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query !== "" && (
                <button type="button" onClick={() => setQuery("")} style={{ color: "var(--paper-faint)" }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {caricamento ? (
            <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>Carico…</div>
          ) : vista === "kanban" ? (
            <div className="kanban" style={{ gridTemplateColumns: `repeat(${stages.length}, 1fr)` }}>
              {stages.map((s) => {
                const colonna = opportunitaPerFase(s.id);
                return (
                  <div
                    className="kcol"
                    key={s.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragId != null) spostaFase(dragId, s.id);
                      setDragId(null);
                    }}
                  >
                    <div className="kcol-head">
                      {s.nome} <span className="kcount num">{colonna.length}</span>
                    </div>
                    {colonna.map((o) => (
                      <div
                        key={o.id}
                        className={`kcard ${classePriorita(o.priorita)}`}
                        draggable
                        onDragStart={() => setDragId(o.id)}
                        onClick={() => setPannelloId(o.id)}
                      >
                        <div className="kc-title">{o.titolo}</div>
                        <div className="kc-who">
                          {o.cliente || "—"} · <span className="num">{formattaValuta(o.valore)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {gruppiCliente.length === 0 ? (
                <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>Niente da mostrare.</div>
              ) : (
                gruppiCliente.map(([nome, elementi]) => (
                  <div className="person-group" key={nome}>
                    <h4>{nome}</h4>
                    <div className="person-items">
                      {elementi.map((o) => (
                        <div
                          key={o.id}
                          className="today-item"
                          style={{ cursor: "pointer" }}
                          onClick={() => setPannelloId(o.id)}
                        >
                          {o.titolo}
                          <span className="who num">{formattaValuta(o.valore)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {opportunitaCorrente && (
        <>
          <div className="crm-panel-overlay" onClick={chiudiPannello} />
          <div className="crm-panel">
            <div className="crm-panel-header">
              Opportunità
              <button type="button" className="crm-panel-close" onClick={chiudiPannello}>
                ✕
              </button>
            </div>
            <div className="crm-panel-body">
              <div className="crm-field">
                <label>Titolo</label>
                <div>{opportunitaCorrente.titolo}</div>
              </div>
              <div className="crm-field">
                <label>Cliente</label>
                <div>{opportunitaCorrente.cliente || "—"}</div>
              </div>
              <div className="crm-field-row">
                <div className="crm-field">
                  <label>Valore</label>
                  <div className="num">{formattaValuta(opportunitaCorrente.valore)}</div>
                </div>
                <div className="crm-field">
                  <label>Probabilità</label>
                  <div className="num">{Math.round(opportunitaCorrente.probabilita)}%</div>
                </div>
              </div>
              <div className="crm-field">
                <label>Scadenza</label>
                <div>{opportunitaCorrente.scadenza || "—"}</div>
              </div>
              <div className="crm-field">
                <label>Fase</label>
                <select
                  value={faseSelezionata ?? ""}
                  onChange={(e) => setFaseSelezionata(Number(e.target.value))}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn-refresh btn-primary"
                onClick={salvaFaseDaPannello}
                disabled={salvando || faseSelezionata === opportunitaCorrente.stageId}
                style={{ justifyContent: "center", padding: "9px 12px" }}
              >
                {salvando ? "Salvo…" : "Salva fase"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
