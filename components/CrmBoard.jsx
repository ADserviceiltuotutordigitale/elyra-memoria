"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FASCE = [
  { chiave: "in_ritardo", etichetta: "In ritardo" },
  { chiave: "oggi", etichetta: "Oggi" },
  { chiave: "settimana", etichetta: "Questa settimana" },
  { chiave: "piu_avanti", etichetta: "Più avanti" },
];
const TEMPERATURE = ["caldo", "tiepido", "freddo"];
const VISTA_STORAGE_KEY = "elyra:crm-vista";

function classeTemperatura(t) {
  if (t === "caldo") return "hot";
  if (t === "tiepido") return "warm";
  return "cold";
}

export default function CrmBoard() {
  const [task, setTask] = useState([]);
  const [vista, setVista] = useState("kanban");
  const [pannelloId, setPannelloId] = useState(null);
  const [bozza, setBozza] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [query, setQuery] = useState("");
  const [idsFiltrati, setIdsFiltrati] = useState(null);
  const [ricercaVia, setRicercaVia] = useState(null);
  const dragId = useRef(null);

  const carica = useCallback(() => {
    return fetch("/api/crm/task")
      .then((res) => res.json())
      .then((body) => setTask(body.task || []));
  }, []);

  useEffect(() => {
    carica();
    // La vista scelta sopravvive al ricaricamento (Parte 5.4).
    const salvata = localStorage.getItem(VISTA_STORAGE_KEY);
    if (salvata) setVista(salvata);
    // Arrivo da Session (?task=<id>): apri già il pannello di quell'elemento.
    const params = new URLSearchParams(window.location.search);
    const daAprire = params.get("task");
    if (daAprire) setPannelloId(daAprire);
  }, [carica]);

  useEffect(() => {
    localStorage.setItem(VISTA_STORAGE_KEY, vista);
  }, [vista]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") chiudiPannello();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Il pannello traccia l'elemento per identificativo, mai per posizione
  // in lista: se una cattura inserisce una riga in testa mentre il
  // pannello è aperto, resta agganciato a quello giusto (Parte 5.4).
  const taskCorrente = task.find((t) => t.id === pannelloId) || null;

  useEffect(() => {
    if (taskCorrente) {
      setBozza({
        titolo: taskCorrente.titolo,
        nota: taskCorrente.nota || "",
        fascia: taskCorrente.fascia,
        temperatura: taskCorrente.temperatura,
        persona: taskCorrente.persone?.nome || "",
        tag: (taskCorrente.tag || []).join(", "),
      });
    } else {
      setBozza(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskCorrente?.id]);

  function chiudiPannello() {
    setPannelloId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    window.history.replaceState({}, "", url);
  }

  async function salva() {
    if (!taskCorrente || !bozza) return;
    setSalvando(true);
    try {
      await fetch(`/api/crm/task/${taskCorrente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titolo: bozza.titolo,
          nota: bozza.nota,
          fascia: bozza.fascia,
          temperatura: bozza.temperatura,
          persona: bozza.persona,
          tag: bozza.tag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      await carica();
    } finally {
      setSalvando(false);
    }
  }

  async function completa() {
    if (!taskCorrente) return;
    await fetch(`/api/crm/task/${taskCorrente.id}/completa`, { method: "POST" });
    chiudiPannello();
    await carica();
  }

  async function elimina() {
    if (!taskCorrente) return;
    await fetch(`/api/crm/task/${taskCorrente.id}`, { method: "DELETE" });
    chiudiPannello();
    await carica();
  }

  function taskPerFascia(fascia) {
    return task
      .filter((t) => t.fascia === fascia)
      .filter((t) => idsFiltrati === null || idsFiltrati.includes(t.id))
      .sort((a, b) => a.posizione - b.posizione);
  }

  function onDrop(faseDestinazione, indiceDestinazione) {
    const id = dragId.current;
    dragId.current = null;
    if (!id) return;

    setTask((prev) => {
      const trascinato = prev.find((t) => t.id === id);
      if (!trascinato) return prev;
      const faseOrigine = trascinato.fascia;
      const resto = prev.filter((t) => t.id !== id);

      const colonnaDestinazione = resto
        .filter((t) => t.fascia === faseDestinazione)
        .sort((a, b) => a.posizione - b.posizione);
      colonnaDestinazione.splice(indiceDestinazione, 0, trascinato);
      const idsDestinazione = colonnaDestinazione.map((t) => t.id);

      const idsOrigine =
        faseOrigine !== faseDestinazione
          ? resto
              .filter((t) => t.fascia === faseOrigine)
              .sort((a, b) => a.posizione - b.posizione)
              .map((t) => t.id)
          : null;

      fetch("/api/crm/riordina", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fascia: faseDestinazione, ids: idsDestinazione }),
      }).catch(() => carica());
      if (idsOrigine) {
        fetch("/api/crm/riordina", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fascia: faseOrigine, ids: idsOrigine }),
        }).catch(() => carica());
      }

      const posizioneDi = (ids, taskId) => ids.indexOf(taskId);
      return prev.map((t) => {
        if (t.id === id) {
          return { ...t, fascia: faseDestinazione, posizione: posizioneDi(idsDestinazione, id) };
        }
        if (idsDestinazione.includes(t.id)) {
          return { ...t, posizione: posizioneDi(idsDestinazione, t.id) };
        }
        if (idsOrigine && idsOrigine.includes(t.id)) {
          return { ...t, posizione: posizioneDi(idsOrigine, t.id) };
        }
        return t;
      });
    });
  }

  async function cercaSeInvio(e) {
    if (e.key !== "Enter") return;
    const domanda = query.trim();
    if (!domanda) {
      setIdsFiltrati(null);
      setRicercaVia(null);
      return;
    }
    try {
      const res = await fetch("/api/crm/cerca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domanda }),
      });
      const body = await res.json();
      setIdsFiltrati(body.ids || []);
      setRicercaVia(body.via);
    } catch {
      setIdsFiltrati([]);
      setRicercaVia("errore");
    }
  }

  function svuotaRicerca() {
    setQuery("");
    setIdsFiltrati(null);
    setRicercaVia(null);
  }

  const gruppiPersona = (() => {
    const visibili = task.filter((t) => idsFiltrati === null || idsFiltrati.includes(t.id));
    const mappa = new Map();
    for (const t of visibili) {
      const chiave = t.persone?.nome || "";
      if (!mappa.has(chiave)) mappa.set(chiave, []);
      mappa.get(chiave).push(t);
    }
    const gruppi = Array.from(mappa.entries())
      .filter(([nome]) => nome !== "")
      .sort((a, b) => a[0].localeCompare(b[0]));
    const senzaPersona = mappa.get("") || [];
    return senzaPersona.length ? [...gruppi, ["Senza persona", senzaPersona]] : gruppi;
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
          <span className="plate-meta">chi aspetta cosa</span>
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
                className={vista === "persona" ? "active" : ""}
                onClick={() => setVista("persona")}
              >
                Per persona
              </button>
            </div>
            <div className="nl-search">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M13.5 13.5L10.5 10.5" />
              </svg>
              <input
                type="text"
                placeholder="cosa posso chiudere in dieci minuti?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={cercaSeInvio}
              />
              {idsFiltrati !== null && (
                <button type="button" onClick={svuotaRicerca} style={{ color: "var(--paper-faint)" }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {idsFiltrati !== null && (
            <div className="ricerca-meta">
              {idsFiltrati.length} risultat{idsFiltrati.length === 1 ? "o" : "i"}
              {ricercaVia === "regole" && " · ricerca testuale (modello non disponibile)"}
              {ricercaVia === "errore" && " · ricerca non riuscita"}
            </div>
          )}

          {vista === "kanban" ? (
            <div className="kanban">
              {FASCE.map((f) => {
                const colonna = taskPerFascia(f.chiave);
                return (
                  <div
                    className="kcol"
                    key={f.chiave}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(f.chiave, colonna.length)}
                  >
                    <div className="kcol-head">
                      {f.etichetta} <span className="kcount num">{colonna.length}</span>
                    </div>
                    {colonna.map((t, i) => (
                      <div
                        key={t.id}
                        className={`kcard ${classeTemperatura(t.temperatura)}`}
                        draggable
                        onDragStart={() => {
                          dragId.current = t.id;
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.stopPropagation();
                          onDrop(f.chiave, i);
                        }}
                        onClick={() => setPannelloId(t.id)}
                      >
                        <div className="kc-title">{t.titolo}</div>
                        <div className="kc-who">{t.persone?.nome || "—"}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {gruppiPersona.length === 0 ? (
                <div style={{ color: "var(--paper-faint)", fontSize: 12.5 }}>Niente da mostrare.</div>
              ) : (
                gruppiPersona.map(([nome, elementi]) => (
                  <div className="person-group" key={nome}>
                    <h4>{nome}</h4>
                    <div className="person-items">
                      {elementi.map((t) => (
                        <div
                          key={t.id}
                          className="today-item"
                          style={{ cursor: "pointer" }}
                          onClick={() => setPannelloId(t.id)}
                        >
                          <span className={`band ${t.fascia === "in_ritardo" ? "late" : "today"}`}>
                            {FASCE.find((f) => f.chiave === t.fascia)?.etichetta}
                          </span>
                          {t.titolo}
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

      {taskCorrente && bozza && (
        <>
          <div className="crm-panel-overlay" onClick={chiudiPannello} />
          <div className="crm-panel">
            <div className="crm-panel-header">
              Modifica elemento
              <button type="button" className="crm-panel-close" onClick={chiudiPannello}>
                ✕
              </button>
            </div>
            <div className="crm-panel-body">
              <div className="crm-field">
                <label>Titolo</label>
                <input
                  value={bozza.titolo}
                  onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })}
                />
              </div>
              <div className="crm-field">
                <label>Nota</label>
                <textarea
                  value={bozza.nota}
                  onChange={(e) => setBozza({ ...bozza, nota: e.target.value })}
                />
              </div>
              <div className="crm-field-row">
                <div className="crm-field">
                  <label>Fascia</label>
                  <select
                    value={bozza.fascia}
                    onChange={(e) => setBozza({ ...bozza, fascia: e.target.value })}
                  >
                    {FASCE.map((f) => (
                      <option key={f.chiave} value={f.chiave}>
                        {f.etichetta}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="crm-field">
                  <label>Temperatura</label>
                  <select
                    value={bozza.temperatura}
                    onChange={(e) => setBozza({ ...bozza, temperatura: e.target.value })}
                  >
                    {TEMPERATURE.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="crm-field">
                <label>Persona</label>
                <input
                  value={bozza.persona}
                  onChange={(e) => setBozza({ ...bozza, persona: e.target.value })}
                  placeholder="nome — vuoto per nessuna"
                />
              </div>
              <div className="crm-field">
                <label>Tag (separati da virgola)</label>
                <input
                  value={bozza.tag}
                  onChange={(e) => setBozza({ ...bozza, tag: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="btn-refresh btn-primary"
                onClick={salva}
                disabled={salvando}
                style={{ justifyContent: "center", padding: "9px 12px" }}
              >
                {salvando ? "Salvo…" : "Salva"}
              </button>
            </div>
            <div className="crm-panel-actions">
              <button type="button" className="btn-refresh" style={{ flex: 1, justifyContent: "center" }} onClick={completa}>
                ✓ Completa
              </button>
              <button
                type="button"
                className="btn-refresh btn-danger"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={elimina}
              >
                Elimina
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
