# Integrazione CRM Odoo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/crm` legge e agisce sulla pipeline di vendita reale di Odoo (fasi, opportunità, cliente, valore) invece della board di task personali di oggi.

**Architecture:** Estende `lib/odoo.js` (client JSON-RPC già esistente) con la lettura di `crm.stage`/`crm.lead` e lo spostamento di fase. Due nuove rotte espongono queste funzioni. Un nuovo componente `CrmOdooBoard.jsx` sostituisce `CrmBoard.jsx` sulla pagina `/crm`; la vecchia board e le sue rotte dedicate vengono rimosse. `lib/azioni.js` guadagna un secondo rilevatore per spostare opportunità da Telegram in linguaggio naturale, sullo stesso modello di `rilevaAzioneSuTask`.

**Tech Stack:** Next.js 16 (App Router, JavaScript), client Odoo JSON-RPC esistente (`lib/odoo.js`), Claude Haiku per il rilevamento delle azioni Telegram (stesso pattern di `lib/azioni.js`).

## Global Constraints

- La pipeline CRM legge Odoo **in diretta a ogni apertura della pagina** — eccezione esplicita e dichiarata alla regola generale "mai un servizio esterno al caricamento" seguita dal resto del progetto. Nessuna istantanea salvata su `log_giornaliero` per questa funzionalità.
- Solo la fase (`stage_id`) è scrivibile su un'opportunità. Nessuna creazione, nessuna eliminazione, nessuna modifica di titolo/valore/cliente da Elyra o da Telegram.
- `lib/store.js` (`getTask`, `addTask`, `updateTask`, `completeTask`, `deleteTask`) e la tabella `task` restano invariati e in uso (card Session di Home, azioni Telegram sui task già costruite).
- Il progetto non ha un framework di test automatico — la verifica avviene con `curl` contro il server dev locale, controllo diretto su Odoo/Supabase, e verifica nel browser, come per tutte le funzionalità precedenti.
- JavaScript, non TypeScript.
- Nessuna dipendenza npm nuova.

---

### Task 1: `lib/odoo.js` — lettura e scrittura della pipeline CRM

**Files:**
- Modify: `lib/odoo.js`

**Interfaces:**
- Produces: `export async function leggiPipelineOdoo()` → `Promise<{ stages: Array<{id: number, nome: string, vinta: boolean}>, opportunita: Array<{id: number, titolo: string, cliente: string|null, stageId: number|null, valore: number, probabilita: number, priorita: string, scadenza: string|null}> }>`
- Produces: `export async function spostaFaseOpportunita(opportunitaId, nuovoStageId)` → `Promise<{id, titolo, cliente, stageId, valore, probabilita, priorita, scadenza}>` (stessa forma di un elemento di `opportunita`)
- Consumes internamente: `eseguiOdoo(modello, metodo, args, kwargs)`, già definita e privata in questo file (usata da `leggiGiornaliBancari`) — non va esportata, solo riusata.

- [ ] **Step 1: Aggiungere le funzioni a `lib/odoo.js`**

Aggiungi in fondo al file (dopo `leggiGiornaliBancari`):

```js
function mappaOpportunita(raw) {
  return {
    id: raw.id,
    titolo: raw.name,
    cliente: raw.partner_name || null,
    stageId: raw.stage_id ? raw.stage_id[0] : null,
    valore: raw.expected_revenue,
    probabilita: raw.probability,
    priorita: raw.priority,
    scadenza: raw.date_deadline || null,
  };
}

const CAMPI_OPPORTUNITA = [
  "name",
  "partner_name",
  "stage_id",
  "expected_revenue",
  "probability",
  "priority",
  "date_deadline",
];

export async function leggiPipelineOdoo() {
  const stagesRaw = await eseguiOdoo(
    "crm.stage",
    "search_read",
    [[]],
    { fields: ["id", "name", "is_won"], order: "sequence asc" }
  );
  const stages = stagesRaw.map((s) => ({ id: s.id, nome: s.name, vinta: s.is_won }));

  const opportunitaRaw = await eseguiOdoo(
    "crm.lead",
    "search_read",
    [[["type", "=", "opportunity"]]],
    { fields: CAMPI_OPPORTUNITA }
  );
  const opportunita = opportunitaRaw.map(mappaOpportunita);

  return { stages, opportunita };
}

export async function spostaFaseOpportunita(opportunitaId, nuovoStageId) {
  const [fase] = await eseguiOdoo("crm.stage", "read", [[nuovoStageId]], { fields: ["is_won"] });
  const patch = { stage_id: nuovoStageId };
  if (fase?.is_won) patch.probability = 100;

  await eseguiOdoo("crm.lead", "write", [[opportunitaId], patch]);

  const [aggiornata] = await eseguiOdoo(
    "crm.lead",
    "read",
    [[opportunitaId]],
    { fields: CAMPI_OPPORTUNITA }
  );

  return mappaOpportunita(aggiornata);
}
```

- [ ] **Step 2: Creare una rotta di debug temporanea**

Crea `app/api/debug-crm/route.js`:

```js
import { leggiPipelineOdoo, spostaFaseOpportunita } from "@/lib/odoo";

export async function GET() {
  try {
    const pipeline = await leggiPipelineOdoo();
    return Response.json({ ok: true, pipeline });
  } catch (err) {
    return Response.json({ ok: false, errore: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { opportunitaId, nuovoStageId } = await request.json();
  try {
    const aggiornata = await spostaFaseOpportunita(opportunitaId, nuovoStageId);
    return Response.json({ ok: true, aggiornata });
  } catch (err) {
    return Response.json({ ok: false, errore: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificare `leggiPipelineOdoo()` contro Odoo reale**

Avvia il server dev (`npm run dev`), poi:

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -H "x-api-secret: $API_SECRET" http://localhost:3000/api/debug-crm
```

Expected: `"ok": true`, `pipeline.stages` con le fasi reali della pipeline (nome, `vinta` true solo su quella di chiusura vinta), `pipeline.opportunita` con le opportunità reali (titolo, cliente, valore, ecc.). Confronta un paio di righe con quello che vedi nel modulo CRM del tuo Odoo per conferma.

- [ ] **Step 4: Verificare `spostaFaseOpportunita()` su un record usa-e-getta, MAI su un'opportunità reale**

Crea un'opportunità di test direttamente via Odoo (non passando dalla rotta di debug — questa create non fa parte della funzionalità, serve solo a testare in sicurezza):

```bash
ODOO_API_KEY=$(grep "^ODOO_API_KEY=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST "https://ad-service.odoo.com/jsonrpc" -H "Content-Type: application/json" -d "{
  \"jsonrpc\": \"2.0\", \"method\": \"call\",
  \"params\": {\"service\":\"object\",\"method\":\"execute_kw\",\"args\":[
    \"ad-service\", 2, \"$ODOO_API_KEY\",
    \"crm.lead\", \"create\",
    [{\"name\": \"TEST piano-crm-odoo — cancellami\", \"type\": \"opportunity\"}]
  ]},
  \"id\": 1
}"
```

Annota l'id restituito (`result`). Prendi un secondo id di fase diverso da quello iniziale dell'opportunità di test guardando `pipeline.stages` dello Step 3. Poi:

```bash
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d "{\"opportunitaId\": <ID_TEST>, \"nuovoStageId\": <ALTRO_STAGE_ID>}" \
  http://localhost:3000/api/debug-crm
```

Expected: `"ok": true`, `aggiornata.stageId` uguale a `<ALTRO_STAGE_ID>`. Se `<ALTRO_STAGE_ID>` è quello con `vinta: true`, verifica anche che `aggiornata.probabilita` sia `100`.

Poi elimina subito il record di test (mai lasciarlo in Odoo):

```bash
curl -s -X POST "https://ad-service.odoo.com/jsonrpc" -H "Content-Type: application/json" -d "{
  \"jsonrpc\": \"2.0\", \"method\": \"call\",
  \"params\": {\"service\":\"object\",\"method\":\"execute_kw\",\"args\":[
    \"ad-service\", 2, \"$ODOO_API_KEY\",
    \"crm.lead\", \"unlink\",
    [[<ID_TEST>]]
  ]},
  \"id\": 2
}"
```

Conferma con un'ultima `search_read` filtrata per nome che l'opportunità di test non esista più.

- [ ] **Step 5: Rimuovere la rotta di debug**

```bash
rm -rf "C:/000_Cowork_Claude/Elyra_Memoria/app/api/debug-crm"
```

- [ ] **Step 6: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/odoo.js
git commit -m "Aggiunge lettura e spostamento fase della pipeline CRM Odoo"
```

---

### Task 2: Rotte `GET /api/crm/pipeline` e `POST /api/crm/pipeline/[id]/fase`

**Files:**
- Create: `app/api/crm/pipeline/route.js`
- Create: `app/api/crm/pipeline/[id]/fase/route.js`

**Interfaces:**
- Consumes: `leggiPipelineOdoo()`, `spostaFaseOpportunita(id, stageId)` da `lib/odoo.js` (Task 1)
- Produces: `GET /api/crm/pipeline` → `{ stages, opportunita }` (stessa forma di `leggiPipelineOdoo()`)
- Produces: `POST /api/crm/pipeline/[id]/fase` con body `{ stageId: number }` → l'opportunità aggiornata (stessa forma di `spostaFaseOpportunita()`)

- [ ] **Step 1: Creare `app/api/crm/pipeline/route.js`**

```js
import { leggiPipelineOdoo } from "@/lib/odoo";

export async function GET() {
  const pipeline = await leggiPipelineOdoo();
  return Response.json(pipeline, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 2: Creare `app/api/crm/pipeline/[id]/fase/route.js`**

```js
import { spostaFaseOpportunita } from "@/lib/odoo";

export async function POST(request, { params }) {
  const { id } = await params;
  const { stageId } = await request.json();
  try {
    const aggiornata = await spostaFaseOpportunita(Number(id), Number(stageId));
    return Response.json(aggiornata);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
```

- [ ] **Step 3: Verificare con curl**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -H "x-api-secret: $API_SECRET" http://localhost:3000/api/crm/pipeline
```

Expected: stesso shape verificato nel Task 1 (`stages`, `opportunita`).

Per la rotta di spostamento, ripeti la procedura del Task 1 Step 4 (crea un'opportunità di test via Odoo, chiama stavolta `POST /api/crm/pipeline/<ID_TEST>/fase` con body `{"stageId": <ALTRO_STAGE_ID>}`, verifica, poi cancella il record di test) — questa volta passando dalla rotta reale invece che dal debug:

```bash
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d "{\"stageId\": <ALTRO_STAGE_ID>}" \
  http://localhost:3000/api/crm/pipeline/<ID_TEST>/fase
```

Expected: l'opportunità aggiornata con `stageId` uguale a `<ALTRO_STAGE_ID>`. Elimina subito il record di test com'è descritto nel Task 1 Step 4.

- [ ] **Step 4: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add "app/api/crm/pipeline"
git commit -m "Aggiunge le rotte GET /api/crm/pipeline e POST /api/crm/pipeline/[id]/fase"
```

---

### Task 3: `components/CrmOdooBoard.jsx` — nuova board, sostituisce `CrmBoard.jsx`

**Files:**
- Create: `components/CrmOdooBoard.jsx`
- Modify: `app/(dashboard)/crm/page.js`

**Interfaces:**
- Consumes: `GET /api/crm/pipeline` → `{ stages: [{id,nome,vinta}], opportunita: [{id,titolo,cliente,stageId,valore,probabilita,priorita,scadenza}] }` (Task 2)
- Consumes: `POST /api/crm/pipeline/[id]/fase` con body `{ stageId }` → opportunità aggiornata (Task 2)

- [ ] **Step 1: Scrivere `components/CrmOdooBoard.jsx`**

```jsx
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
```

- [ ] **Step 2: Aggiornare `app/(dashboard)/crm/page.js`**

Sostituisci l'intero contenuto con:

```jsx
import DashboardGrid from "@/components/DashboardGrid";
import CrmOdooBoard from "@/components/CrmOdooBoard";

export default function CrmScreen() {
  return (
    <DashboardGrid cols={1}>
      <CrmOdooBoard />
    </DashboardGrid>
  );
}
```

- [ ] **Step 3: Verificare nel browser**

Naviga su `http://localhost:3000/crm` da loggato. Verifica:
- Le colonne Kanban mostrano i nomi reali delle fasi Odoo (non più In ritardo/Oggi/ecc.), con le opportunità reali dentro (titolo, cliente, valore).
- "Per cliente" raggruppa correttamente per nome cliente.
- Cliccando su una scheda si apre il pannello con i dati corretti e una fase preselezionata uguale a quella attuale.
- Il pulsante "Salva fase" è disabilitato finché non cambi la select.
- La ricerca filtra per titolo/cliente.

Per verificare lo spostamento (drag&drop o dal pannello) senza toccare dati reali, ripeti la procedura di creazione/cancellazione di un'opportunità di test del Task 1 Step 4, ma questa volta trascina la scheda di test tra colonne nel browser (o usa il pannello) invece di chiamare la rotta con curl — conferma che la card si sposti di colonna e che, ricaricando la pagina, resti nella nuova fase. Poi cancella il record di test via Odoo com'è descritto nel Task 1 Step 4.

- [ ] **Step 4: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add components/CrmOdooBoard.jsx "app/(dashboard)/crm/page.js"
git commit -m "CrmOdooBoard sostituisce CrmBoard: /crm mostra la pipeline Odoo reale"
```

---

### Task 4: Rimuovere la vecchia board dei task personali e le sue rotte

**Files:**
- Delete: `components/CrmBoard.jsx`
- Delete: `app/api/crm/task/route.js`
- Delete: `app/api/crm/task/[id]/route.js`
- Delete: `app/api/crm/task/[id]/completa/route.js`
- Delete: `app/api/crm/riordina/route.js`
- Delete: `app/api/crm/cerca/route.js`

**Interfaces:** nessuna — rimozione di codice ormai senza consumatori (verificato: solo `app/(dashboard)/crm/page.js`, già aggiornato nel Task 3, e `CrmBoard.jsx` stesso li referenziavano).

- [ ] **Step 1: Verificare che nulla li usi ancora**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
grep -rl "crm/riordina\|crm/task\|crm/cerca\|CrmBoard" app components lib --include="*.js" --include="*.jsx"
```

Expected: nessun risultato (il Task 3 ha già sostituito l'unico riferimento in `app/(dashboard)/crm/page.js`).

- [ ] **Step 2: Rimuovere i file**

```bash
rm components/CrmBoard.jsx
rm -rf "app/api/crm/task"
rm -rf "app/api/crm/riordina"
rm -rf "app/api/crm/cerca"
```

- [ ] **Step 3: Verificare che `lib/store.js` resti usato altrove**

```bash
grep -rn "getTask\|completeTask\|deleteTask" app components lib --include="*.js" --include="*.jsx"
```

Expected: `getTask` compare ancora in `app/(dashboard)/page.js` (card Session) e in `lib/azioni.js` (azioni Telegram sui task); `completeTask`/`deleteTask` compaiono ancora in `lib/azioni.js` e in `lib/store.js` stesso. Se una di queste chiamate fosse sparita, fermati: vorrebbe dire che la rimozione ha toccato qualcosa che non doveva.

- [ ] **Step 4: Build pulita**

```bash
npm run build
```

Expected: nessun errore, nessun import rotto verso i file rimossi.

- [ ] **Step 5: Verificare nel browser che Home non sia stata toccata**

Naviga su `http://localhost:3000/` da loggato: la card Session deve ancora mostrare i task di oggi/in ritardo come prima.

- [ ] **Step 6: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add -A
git commit -m "Rimuove la vecchia board dei task personali e le rotte CRM ormai inutilizzate"
```

---

### Task 5: Spostare opportunità da Telegram in linguaggio naturale

**Files:**
- Modify: `lib/azioni.js`
- Modify: `app/api/telegram/webhook/route.js`

**Interfaces:**
- Consumes: `leggiPipelineOdoo()`, `spostaFaseOpportunita(id, stageId)` da `lib/odoo.js` (Task 1)
- Produces: `export async function rilevaAzioneSuOpportunita(testo)` → `Promise<{ opportunitaId: number|null, stageId: number|null, titolo: string|null, faseNome: string|null }>`

- [ ] **Step 1: Aggiungere `rilevaAzioneSuOpportunita` a `lib/azioni.js`**

Aggiungi in fondo al file (dopo `rilevaAzioneSuTask`), e aggiungi l'import di `leggiPipelineOdoo` in cima:

```js
import { leggiPipelineOdoo } from "./odoo";
```

```js
const SYSTEM_PROMPT_OPPORTUNITA = `Decidi se questa frase è un comando per spostare
un'opportunità di vendita esistente a un'altra fase della pipeline. "Segna vinta"
o "segna persa" sono anch'essi comandi di spostamento fase, verso la fase con
vinta=true o verso la fase di chiusura negativa — non un'azione speciale.

Fasi disponibili (JSON, {id, nome, vinta}):
{{FASI}}

Opportunità aperte (JSON, {id, titolo, cliente}):
{{OPPORTUNITA}}

Se è chiaramente un comando di spostamento E riesci a identificare con sicurezza
UNA SOLA opportunità e UNA SOLA fase di destinazione, rispondi con:
{"opportunitaId": <id esatto dall'elenco>, "stageId": <id esatto dall'elenco fasi>}

In ogni altro caso — non è un comando di questo tipo, oppure lo è ma è ambiguo o
non trovi una corrispondenza sicura — rispondi con:
{"opportunitaId": null, "stageId": null}

Non inventare mai un id che non è negli elenchi. Rispondi SOLO con l'oggetto
JSON, senza testo prima o dopo.`;

export async function rilevaAzioneSuOpportunita(testo) {
  if (!anthropic) return { opportunitaId: null, stageId: null, titolo: null, faseNome: null };

  const { stages, opportunita } = await leggiPipelineOdoo();
  if (opportunita.length === 0) {
    return { opportunitaId: null, stageId: null, titolo: null, faseNome: null };
  }

  const fasiCompatte = stages.map((s) => ({ id: s.id, nome: s.nome, vinta: s.vinta }));
  const opportunitaCompatte = opportunita.map((o) => ({ id: o.id, titolo: o.titolo, cliente: o.cliente }));
  const idFaseValidi = new Set(fasiCompatte.map((s) => s.id));
  const idOpportunitaValidi = new Set(opportunitaCompatte.map((o) => o.id));

  let risposta;
  try {
    risposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT_OPPORTUNITA
        .replace("{{FASI}}", JSON.stringify(fasiCompatte))
        .replace("{{OPPORTUNITA}}", JSON.stringify(opportunitaCompatte)),
      messages: [{ role: "user", content: testo }],
    });
  } catch {
    return { opportunitaId: null, stageId: null, titolo: null, faseNome: null };
  }

  const testoRisposta = risposta.content
    .filter((blocco) => blocco.type === "text")
    .map((blocco) => blocco.text)
    .join("");

  const parsed = estraiJson(testoRisposta);
  if (!parsed) return { opportunitaId: null, stageId: null, titolo: null, faseNome: null };

  if (!idOpportunitaValidi.has(parsed.opportunitaId) || !idFaseValidi.has(parsed.stageId)) {
    return { opportunitaId: null, stageId: null, titolo: null, faseNome: null };
  }

  const opportunitaTrovata = opportunitaCompatte.find((o) => o.id === parsed.opportunitaId);
  const faseTrovata = fasiCompatte.find((s) => s.id === parsed.stageId);

  return {
    opportunitaId: parsed.opportunitaId,
    stageId: parsed.stageId,
    titolo: opportunitaTrovata.titolo,
    faseNome: faseTrovata.nome,
  };
}
```

Nota: `estraiJson`, `anthropic` e `MODEL` sono già definiti in cima al file da `rilevaAzioneSuTask` — riusali, non ridefinirli.

- [ ] **Step 2: Collegare nel webhook Telegram**

In `app/api/telegram/webhook/route.js`, aggiungi l'import e il controllo, subito dopo quello per `rilevaAzioneSuTask` e prima della cattura:

```js
import { rilevaAzioneSuTask, rilevaAzioneSuOpportunita } from "@/lib/azioni";
```

```js
  const { opportunitaId, stageId, titolo: titoloOpp, faseNome } = await rilevaAzioneSuOpportunita(testo);
  if (opportunitaId !== null) {
    const { spostaFaseOpportunita } = await import("@/lib/odoo");
    await spostaFaseOpportunita(opportunitaId, stageId);
    await inviaMessaggio(chatId, `Spostata: "${titoloOpp}" → ${faseNome}`);
    return;
  }
```

Inseriscilo subito dopo il blocco esistente per `rilevaAzioneSuTask` (quello con `if (azione === "elimina")` / `if (azione === "completa")`), prima della riga `const risultato = await eseguiCattura(...)`. `rilevaAzioneSuOpportunita` ritorna `{opportunitaId, stageId, titolo, faseNome}` (nessun campo `azione` — a differenza di `rilevaAzioneSuTask`, qui il segnale "trovato/non trovato" è `opportunitaId !== null`).

- [ ] **Step 3: Verificare end-to-end contro un'opportunità di test**

Crea un'opportunità di test via Odoo (stessa procedura del Task 1 Step 4) con un titolo riconoscibile, es. `"TEST telegram-crm — cancellami"`. Avvia il server dev, poi simula una chiamata webhook (stesso pattern usato per verificare le azioni sui task in una fase precedente di questo progetto — vedi `git log` per l'esempio con `curl -X POST .../api/telegram/webhook` e i header `x-telegram-bot-api-secret-token` + payload `message.from.id`/`message.chat.id` uguali a `TELEGRAM_USER_ID`), con testo tipo `"sposta TEST telegram-crm su <nome di un'altra fase>"`.

Expected: la chiamata torna `{"ok": true}`; interrogando Odoo (`crm.lead search_read` filtrato per id) l'opportunità di test risulta nella nuova fase; il bot ha inviato un messaggio Telegram di conferma (verificabile aprendo Telegram, o accettando l'evidenza indiretta se il messaggio è stato inviato senza errori nei log del server dev).

Prova anche un caso senza corrispondenza (es. un titolo inventato che non esiste) e conferma che il testo prosegua come cattura normale invece di fallire o inventare uno spostamento.

Al termine, cancella l'opportunità di test via Odoo (Task 1 Step 4).

- [ ] **Step 4: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/azioni.js app/api/telegram/webhook/route.js
git commit -m "Telegram: sposta opportunità Odoo in linguaggio naturale (anche 'segna vinta/persa')"
```

---

### Task 6: Deploy e verifica in produzione

**Files:** nessuno.

**Interfaces:** nessuna.

- [ ] **Step 1: Chiedere il permesso di fare push**

- [ ] **Step 2: Push**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git push origin master
```

- [ ] **Step 3: Verificare in produzione**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -H "x-api-secret: $API_SECRET" https://elyra-memoria.vercel.app/api/crm/pipeline
```

Expected: stesso shape verificato in locale, con dati reali. Poi apri `https://elyra-memoria.vercel.app/crm` da loggato e conferma visivamente che la pipeline reale si vede correttamente (fasi, opportunità, cliente, valore), che il pannello si apre e che "Per cliente" raggruppa correttamente.

Non ripetere il test di scrittura (creazione/spostamento/cancellazione di un'opportunità di test) in produzione: è già stato verificato end-to-end nei Task 1, 2 e 5 contro la stessa istanza Odoo reale — production e locale parlano allo stesso Odoo, quindi la scrittura è già provata.

- [ ] **Step 4: Riferire il risultato all'utente**

Conferma cosa è stato verificato e chiedi che dia un'occhiata alla pipeline reale nella dashboard per un ultimo controllo visivo.

---

## Note per chi esegue questo piano

- Ogni volta che il piano chiede di creare un'opportunità di test in Odoo, **cancellala sempre subito dopo** — mai lasciare record di prova nella pipeline di vendita reale dell'utente.
- Segui l'ordine dei task: il Task 3 deve essere completo e verificato prima del Task 4 (altrimenti si rimuove `CrmBoard.jsx` mentre `page.js` lo referenzia ancora). Il Task 5 dipende da `spostaFaseOpportunita`/`leggiPipelineOdoo` del Task 1, non dai task 2-4.
