# Integrazione Odoo per il Polso finanziario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la fonte dati del Polso finanziario — da "foglio Google Sheets + estrazione IA" a "saldi letti direttamente da Odoo via API esterna" — con due totali separati, personale e lavoro.

**Architecture:** Un nuovo modulo server-only `lib/odoo.js` parla con l'API JSON-RPC esterna di Odoo (autenticazione via chiave API, non password) e legge il saldo dei 4 giornali bancari. `lib/finanze.js` usa questo modulo al posto della lettura Google Sheets + Claude. L'istantanea (stessa forma di persistenza di oggi, `log_giornaliero.finanze`) cambia forma: da un patrimonio unico a due totali (`totale_personale`, `totale_lavoro`) con la lista dei 4 conti. `PolsoFinanziarioCard.jsx` mostra i due totali separati.

**Tech Stack:** Next.js 16 (App Router, JavaScript), Supabase (persistenza istantanee via `lib/store.js`), fetch nativo per JSON-RPC verso Odoo (nessuna dipendenza npm nuova).

## Global Constraints

- Nessun componente o rotta tocca Supabase direttamente: passa sempre da `lib/store.js` (Parte 1.3 della guida PersonalOS, già in vigore in questo progetto — vedi `CLAUDE.md`).
- Il caricamento di una pagina non chiama mai un servizio esterno (Odoo incluso): l'aggiornamento parte solo dal pulsante "aggiorna" (stessa regola ferrea già in `PolsoFinanziarioCard.jsx`).
- Segreti (chiave API Odoo, ecc.) solo in variabili d'ambiente, mai nel codice — stesso pattern di `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ecc. già in `.env.local`.
- Il progetto non ha un framework di test automatico (nessun Jest/Vitest installato in tutta la codebase). La verifica di ogni task avviene con `curl` contro il server di sviluppo locale e controllo diretto su Supabase — lo stesso metodo usato per ogni altra funzionalità già costruita in questo progetto. Non installare un test runner solo per questa feature.
- JavaScript, non TypeScript (Parte 1.2 della guida).

---

### Task 1: `lib/odoo.js` — client Odoo (autenticazione + saldo dei giornali bancari)

**Files:**
- Create: `lib/odoo.js`
- Create (temporaneo, rimosso a fine task): `app/api/debug-odoo/route.js`
- Modify: `.env.local` (nuove variabili)

**Interfaces:**
- Produces: `export async function leggiGiornaliBancari()` — nessun argomento, restituisce `Promise<Array<{ nome: string, saldo: number, ambito: "personale"|"lavoro" }>>`, un elemento per ogni giornale Odoo di tipo `bank`.

- [ ] **Step 1: Raccogliere le credenziali Odoo dall'utente**

Chiedi all'utente questi quattro valori (non li puoi indovinare né dedurre):
- URL della sua istanza Odoo (es. `https://nomeazienda.odoo.com`)
- Nome del database Odoo
- Il suo username Odoo
- Una chiave API generata da lui in **Impostazioni → Utenti e Aziende → Utenti → scheda "Chiavi API"** (mai la password del suo account)

Aggiungi a `.env.local` (percorso: `C:\000_Cowork_Claude\Elyra_Memoria\.env.local`):

```
ODOO_URL=<url fornito dall'utente, senza slash finale>
ODOO_DB=<nome database fornito dall'utente>
ODOO_USERNAME=<username fornito dall'utente>
ODOO_API_KEY=<chiave API fornita dall'utente>
```

- [ ] **Step 2: Scrivere `lib/odoo.js`**

```js
import "server-only";

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY = process.env.ODOO_API_KEY;

// Solo 4 conti fissi: non serve un'interfaccia per gestire questa
// mappatura. Il nome a sinistra deve combaciare ESATTAMENTE con il nome
// del giornale in Odoo (verificato allo Step 4 di questo task) — vedi la
// spec: docs/superpowers/specs/2026-08-14-odoo-finanze-integration-design.md
const MAPPATURA_CONTI = {
  BBVA: "personale",
  Revolut: "personale",
  WeBank: "personale",
  "Poste Italiane Business": "lavoro",
};

function ambitoDiConto(nome) {
  return MAPPATURA_CONTI[nome] || "personale";
}

// L'API esterna di Odoo (JSON-RPC): un'unica busta per ogni chiamata,
// "service" + "method" + "args" a seconda che si parli con "common"
// (autenticazione) o "object" (lettura/scrittura sui modelli).
async function chiamaOdoo(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1000000),
    }),
  });
  const body = await res.json();
  if (body.error) {
    const messaggio = body.error.data?.message || body.error.message || "errore sconosciuto";
    throw new Error(`[odoo] ${method}: ${messaggio}`);
  }
  return body.result;
}

let uidCache = null;

async function autenticaOdoo() {
  if (uidCache) return uidCache;
  const uid = await chiamaOdoo("common", "authenticate", [
    ODOO_DB,
    ODOO_USERNAME,
    ODOO_API_KEY,
    {},
  ]);
  if (!uid) {
    throw new Error("[odoo] autenticazione fallita — controlla URL, database, username e chiave API");
  }
  uidCache = uid;
  return uid;
}

async function eseguiOdoo(modello, metodo, args, kwargs = {}) {
  const uid = await autenticaOdoo();
  return chiamaOdoo("object", "execute_kw", [
    ODOO_DB,
    uid,
    ODOO_API_KEY,
    modello,
    metodo,
    args,
    kwargs,
  ]);
}

// Somma i movimenti contabilizzati sul conto collegato al giornale — è il
// modo stabile tra versioni Odoo di ottenere il saldo corrente, anche se
// non è il metodo più veloce (una query per giornale). Vedi la spec:
// docs/superpowers/specs/2026-08-14-odoo-finanze-integration-design.md
async function saldoGiornale(giornaleId) {
  const [giornale] = await eseguiOdoo("account.journal", "read", [[giornaleId]], {
    fields: ["default_account_id"],
  });
  const contoId = giornale?.default_account_id?.[0];
  if (!contoId) return 0;

  const righe = await eseguiOdoo(
    "account.move.line",
    "search_read",
    [[["account_id", "=", contoId], ["parent_state", "=", "posted"]]],
    { fields: ["debit", "credit"] }
  );
  return righe.reduce((tot, r) => tot + (r.debit - r.credit), 0);
}

export async function leggiGiornaliBancari() {
  const giornali = await eseguiOdoo(
    "account.journal",
    "search_read",
    [[["type", "=", "bank"]]],
    { fields: ["id", "name"] }
  );

  const risultati = [];
  for (const giornale of giornali) {
    const saldo = await saldoGiornale(giornale.id);
    risultati.push({ nome: giornale.name, saldo, ambito: ambitoDiConto(giornale.name) });
  }
  return risultati;
}
```

- [ ] **Step 3: Creare la rotta di debug temporanea**

Crea `app/api/debug-odoo/route.js`:

```js
// Rotta temporanea per verificare lib/odoo.js — la tolgo appena la
// verifica passa, non fa parte della feature.
import { leggiGiornaliBancari } from "@/lib/odoo";

export async function GET() {
  try {
    const giornali = await leggiGiornaliBancari();
    return Response.json({ ok: true, giornali });
  } catch (err) {
    return Response.json({ ok: false, errore: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Avviare il server di sviluppo e chiamare la rotta**

Se il server dev non è già attivo, avvialo (`preview_start` con `name: "elyra-dev"` se stai usando il Browser pane, oppure `npm run dev` dalla cartella del progetto). Poi:

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -H "x-api-secret: $API_SECRET" http://localhost:3000/api/debug-odoo
```

Expected: un JSON con `"ok": true` e un array `giornali` con 4 elementi, ognuno `{ nome, saldo, ambito }`. I nomi devono corrispondere ai 4 giornali bancari reali visibili nella Dashboard di Contabilità dell'utente, i saldi devono corrispondere (a meno di differenze minori dovute a movimenti non ancora contabilizzati) a quello che l'utente vede lì, e `ambito` deve essere `"personale"` per BBVA/Revolut/WeBank e `"lavoro"` per Poste Italiane Business.

Se il nome esatto di un giornale in Odoo non combacia con `MAPPATURA_CONTI` (es. "Poste Italiane Business" si chiama diversamente nella loro istanza), quel conto torna `ambito: "personale"` per via del fallback in `ambitoDiConto` — se succede, aggiorna subito `MAPPATURA_CONTI` in `lib/odoo.js` con il nome esatto letto dalla risposta e richiama la rotta finché tutti e 4 i conti hanno l'ambito corretto.

Se `ok: false`: leggi `errore` per intero. Le cause più comuni:
- "autenticazione fallita" → URL, database, username o chiave API sbagliati — falli ricontrollare all'utente
- un errore su `account.journal` o `account.move.line` non trovato → il modello contabile potrebbe chiamarsi diversamente nella loro versione di Odoo; chiedi all'utente il numero di versione (visibile in basso a sinistra nel menu Impostazioni di Odoo) e verifica il nome esatto dei campi per quella versione nella documentazione ufficiale (`https://www.odoo.com/documentation/<versione>/developer/reference/external_api.html`)

Non passare al task successivo finché questo non risponde con dati reali e corretti — è la base di tutto il resto.

- [ ] **Step 5: Rimuovere la rotta di debug**

```bash
rm -rf "C:/000_Cowork_Claude/Elyra_Memoria/app/api/debug-odoo"
```

- [ ] **Step 6: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/odoo.js
git commit -m "Aggiunge lib/odoo.js — client JSON-RPC per leggere i saldi dei giornali bancari"
```

(`.env.local` non va in git — è già escluso da `.gitignore`.)

---

### Task 2: Aggiornare `lib/finanze.js` per usare Odoo invece di Google Sheets

**Files:**
- Modify: `lib/finanze.js` (riscrittura quasi completa)

**Interfaces:**
- Consumes: `leggiGiornaliBancari()` da `lib/odoo.js` (Task 1) — `Promise<Array<{ nome: string, saldo: number, ambito: "personale"|"lavoro" }>>`
- Consumes: `getLogGiornaliero(data)`, `updateLogGiornaliero(data, patch)`, `getLogGiornalieroRange(dataInizio, dataFine)` da `lib/store.js` (già esistenti, invariati)
- Consumes: `oggiISO()`, `giorniFa(dataISO, n)` da `lib/date.js` (già esistenti, invariati)
- Produces: `export async function aggiornaPolsoFinanziario()` → `Promise<{ generato_alle: string, conti: Array<{nome, saldo, ambito}>, totale_personale: number, totale_lavoro: number }>`
- Produces: `export async function leggiUltimoPolso()` → `Promise<{ istantanea: object|null, deltaPersonale: number|null, deltaLavoro: number|null, dataConfronto: string|null }>`

- [ ] **Step 1: Riscrivere `lib/finanze.js`**

Sostituisci l'intero contenuto del file con:

```js
import "server-only";
import { leggiGiornaliBancari } from "./odoo";
import { updateLogGiornaliero, getLogGiornalieroRange } from "./store";
import { oggiISO, giorniFa } from "./date";

// Il caricamento della pagina non chiama mai questa funzione: parte solo
// dal pulsante di aggiornamento (stessa regola ferrea del Polso di prima).
export async function aggiornaPolsoFinanziario() {
  const conti = await leggiGiornaliBancari();

  const totale_personale = conti
    .filter((c) => c.ambito === "personale")
    .reduce((tot, c) => tot + c.saldo, 0);
  const totale_lavoro = conti
    .filter((c) => c.ambito === "lavoro")
    .reduce((tot, c) => tot + c.saldo, 0);

  const istantanea = {
    generato_alle: new Date().toISOString(),
    conti,
    totale_personale,
    totale_lavoro,
  };

  const oggi = oggiISO();
  await updateLogGiornaliero(oggi, { finanze: istantanea });
  return istantanea;
}

// Legge sempre l'ultima istantanea salvata — mai Odoo in diretta. Il
// delta è calcolato separatamente per personale e lavoro, contro la
// istantanea valida più recente trovata negli ultimi 30 giorni.
export async function leggiUltimoPolso() {
  const oggi = oggiISO();
  const righe = await getLogGiornalieroRange(giorniFa(oggi, 30), oggi);
  const conSnapshot = righe.filter(
    (r) => r.finanze && typeof r.finanze.totale_personale === "number"
  );

  if (conSnapshot.length === 0) {
    return { istantanea: null, deltaPersonale: null, deltaLavoro: null, dataConfronto: null };
  }

  conSnapshot.sort((a, b) => b.data.localeCompare(a.data));
  const ultima = conSnapshot[0].finanze;
  const precedente = conSnapshot[1];

  const deltaPersonale = precedente
    ? ultima.totale_personale - precedente.finanze.totale_personale
    : null;
  const deltaLavoro = precedente
    ? ultima.totale_lavoro - precedente.finanze.totale_lavoro
    : null;

  return {
    istantanea: ultima,
    deltaPersonale,
    deltaLavoro,
    dataConfronto: precedente?.data || null,
  };
}
```

- [ ] **Step 2: Verificare che le rotte esistenti non abbiano bisogno di modifiche**

Apri `app/api/finanze/route.js` e `app/api/finanze/aggiorna/route.js` e conferma che facciano solo da passacarte verso `leggiUltimoPolso()` e `aggiornaPolsoFinanziario()` senza assumere nulla sulla forma esatta dei dati (es. senza leggere `istantanea.patrimonio_netto` da qualche parte). Se lo fanno, non serve toccarli: la nuova forma dei dati passa attraverso `Response.json(...)` così com'è.

- [ ] **Step 3: Riavviare il server dev e chiamare le rotte reali**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST -H "x-api-secret: $API_SECRET" http://localhost:3000/api/finanze/aggiorna
```

Expected: un JSON con `istantanea.conti` (4 elementi, ognuno con `nome`, `saldo`, `ambito`), `istantanea.totale_personale`, `istantanea.totale_lavoro`. Somma a mano i saldi dei 3 conti "personale" e conferma che combaci con `totale_personale` (stesso per `totale_lavoro` con l'unico conto "lavoro").

```bash
curl -s -H "x-api-secret: $API_SECRET" http://localhost:3000/api/finanze
```

Expected: la prima chiamata (nessuna istantanea precedente) torna `deltaPersonale: null, deltaLavoro: null`. Richiama `aggiorna` una seconda volta e rifai questa chiamata: ora `dataConfronto` deve essere valorizzato solo se la seconda istantanea cade su un giorno diverso dalla prima (altrimenti sovrascrive la stessa riga di oggi — è il comportamento atteso di `updateLogGiornaliero`, una sola istantanea al giorno).

- [ ] **Step 4: Verificare su Supabase**

```bash
SUPA_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
SUPA_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
OGGI=$(TZ=Europe/Rome date +%F)
curl -s "$SUPA_URL/rest/v1/log_giornaliero?data=eq.$OGGI&select=finanze" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"
```

Expected: la riga di oggi ha `finanze.conti`, `finanze.totale_personale`, `finanze.totale_lavoro` popolati coerentemente con quanto visto al passo precedente.

- [ ] **Step 5: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/finanze.js
git commit -m "lib/finanze.js legge da Odoo invece che da Google Sheets, due totali personale/lavoro"
```

---

### Task 3: Aggiornare `app/api/riepilogo/route.js` per il nuovo modello a due totali

Non è nella spec originale, ma è una conseguenza diretta del Task 2: questa
rotta alimenta il gauge "Patrimonio" nella `TopBar` (tutte le pagine) e oggi
legge `polso.delta` e `polso.istantanea.patrimonio_netto` — due campi che
non esistono più dopo il Task 2. Senza questo task il gauge in `TopBar.jsx`
smette di funzionare in produzione (mostra sempre `—`). Per restare nello
scope di questa iterazione, il gauge continua a mostrare un'unica
percentuale combinata (personale + lavoro insieme) — la scomposizione per
ambito è già visibile nella card dedicata (Task 4), la barra in alto resta
un indicatore compatto e non va ridisegnata.

**Files:**
- Modify: `app/api/riepilogo/route.js`

**Interfaces:**
- Consumes: `leggiUltimoPolso()` da `lib/finanze.js` (Task 2) — `Promise<{ istantanea: {totale_personale, totale_lavoro, ...}|null, deltaPersonale: number|null, deltaLavoro: number|null, dataConfronto: string|null }>`
- Produces: nessuna modifica alla forma della risposta HTTP — resta `{ focus: string|null, deltaPercento: number|null }`, quindi `components/TopBar.jsx` non richiede modifiche.

- [ ] **Step 1: Riscrivere `app/api/riepilogo/route.js`**

```js
import { getProfilo } from "@/lib/store";
import { leggiUltimoPolso } from "@/lib/finanze";

// Alimenta la striscia strumenti nella barra in alto (tutte le pagine).
export async function GET() {
  const [profilo, polso] = await Promise.all([getProfilo(), leggiUltimoPolso()]);

  let deltaPercento = null;
  if (polso.istantanea && polso.deltaPersonale !== null && polso.deltaLavoro !== null) {
    const totaleAttuale = polso.istantanea.totale_personale + polso.istantanea.totale_lavoro;
    const deltaTotale = polso.deltaPersonale + polso.deltaLavoro;
    const precedente = totaleAttuale - deltaTotale;
    if (precedente !== 0) deltaPercento = (deltaTotale / precedente) * 100;
  }

  return Response.json(
    { focus: profilo.focus_del_giorno || null, deltaPercento },
    { headers: { "Cache-Control": "no-store" } }
  );
}
```

- [ ] **Step 2: Verificare con curl**

Assicurati di avere almeno due istantanee finanziarie salvate su giorni diversi (se hai seguito il Task 2 nello stesso giorno, il confronto potrebbe risultare `null` — è atteso, vedi Task 2 Step 3). Poi:

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -H "x-api-secret: $API_SECRET" http://localhost:3000/api/riepilogo
```

Expected: `{ "focus": ..., "deltaPercento": <numero o null> }`, nessun errore 500. Se `deltaPercento` è un numero, verifica a mano che combaci con `(deltaPersonale + deltaLavoro) / (totale_personale + totale_lavoro - deltaPersonale - deltaLavoro) * 100` usando i valori tornati da `/api/finanze`.

- [ ] **Step 3: Verificare nel browser**

Naviga su `http://localhost:3000/` da loggato e controlla il gauge "Patrimonio" nella `TopBar`: deve mostrare una percentuale (o `—` se non c'è ancora un confronto), mai un errore o un valore `NaN`.

- [ ] **Step 4: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add app/api/riepilogo/route.js
git commit -m "riepilogo: il gauge Patrimonio usa il totale combinato personale+lavoro"
```

---

### Task 4: Ridisegnare `components/PolsoFinanziarioCard.jsx`

**Files:**
- Modify: `components/PolsoFinanziarioCard.jsx` (riscrittura completa)
- Modify: `app/globals.css` (nuove classi per i due totali affiancati)

**Interfaces:**
- Consumes: `GET /api/finanze` → `{ istantanea: {conti, totale_personale, totale_lavoro, generato_alle} | null, deltaPersonale: number|null, deltaLavoro: number|null }` (prodotto dal Task 2)
- Consumes: `POST /api/finanze/aggiorna` → `{ istantanea: {...} }` (stesso shape, prodotto dal Task 2)

- [ ] **Step 1: Aggiungere le classi CSS per i due totali affiancati**

In `app/globals.css`, subito dopo la regola esistente `.pulse-bars{...}` (cercala con la stessa formattazione compatta delle regole vicine), aggiungi:

```css
.pulse-doppio{ display:flex; gap:16px; }
.pulse-blocco{ flex:1; }
.pulse-blocco .pulse-ambito{
  font-size:9.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase;
  color:var(--paper-faint); margin-bottom:2px;
}
```

- [ ] **Step 2: Riscrivere `components/PolsoFinanziarioCard.jsx`**

```jsx
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
                  <span className="pbar-label">{c.nome}</span>
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
```

- [ ] **Step 3: Verificare nel browser**

Naviga su `http://localhost:3000/` (loggato), individua la card `#card-polso`, premi il pulsante "aggiorna". Con `javascript_tool` o `get_page_text`, conferma che il testo della card contenga sia "Personale" sia "Lavoro" con due importi distinti, e sotto la lista dei 4 conti con nome e saldo.

Se il progetto ha il Browser pane collegato a un server dev attivo:

```
mcp__Claude_Browser__navigate → http://localhost:3000/
mcp__Claude_Browser__javascript_tool → document.querySelector('#card-polso').textContent
```

Expected: la stringa contiene "Personale", "Lavoro", e i 4 nomi dei conti letti nel Task 1.

- [ ] **Step 4: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add components/PolsoFinanziarioCard.jsx app/globals.css
git commit -m "PolsoFinanziarioCard mostra due totali separati, personale e lavoro"
```

---

### Task 5: Rimuovere il codice e le variabili Google Sheets ormai inutilizzate

**Files:**
- Modify: `package.json` (rimuovere `googleapis` se non usato altrove)
- Modify: `.env.local` (rimuovere variabili Google Sheets)

**Interfaces:** nessuna — task di pulizia, non introduce né consuma interfacce.

- [ ] **Step 1: Verificare che `googleapis` non sia usato altrove**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
grep -rl "googleapis" --include="*.js" --include="*.jsx" app lib components 2>/dev/null
```

Expected: nessun risultato (dopo il Task 2, `lib/finanze.js` non lo importa più — era l'unico file a usarlo). Se compare ancora qualche file, fermati e capisci perché prima di continuare: potrebbe esserci un altro uso di Google Sheets rimasto (ad esempio se `lib/ical.js` o un'altra parte del calendario lo usasse — verifica leggendo il file trovato).

- [ ] **Step 2: Disinstallare la dipendenza**

```bash
$env:PATH += ";C:\Program Files\nodejs"  # PowerShell, se necessario in questo ambiente
npm uninstall googleapis
```

- [ ] **Step 3: Rimuovere le variabili Google Sheets da `.env.local`**

Apri `.env.local` e rimuovi le tre righe:
```
GOOGLE_SHEETS_FINANCE_ID=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_SERVICE_ACCOUNT_KEY=...
```

Lascia invariata `GOOGLE_CALENDAR_ICAL_URL` — appartiene alla scheda Calendario, non al Polso finanziario, e resta in uso.

- [ ] **Step 4: Build pulita**

```bash
npm run build
```

Expected: build senza errori, nessun avviso su `googleapis` mancante (conferma che nessun file lo importa più).

- [ ] **Step 5: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add package.json package-lock.json
git commit -m "Rimuove la dipendenza googleapis, non più usata dopo il passaggio a Odoo"
```

---

### Task 6: Deploy e verifica in produzione

**Files:** nessuno (task di deploy/verifica).

**Interfaces:** nessuna.

- [ ] **Step 1: Chiedere il permesso di fare push**

Il push su GitHub pubblica automaticamente su Vercel (integrazione già collegata dal deploy iniziale). Chiedi esplicitamente il permesso all'utente prima di questo step, come fatto per ogni push precedente in questo progetto.

- [ ] **Step 2: Push**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git push origin master
```

- [ ] **Step 3: Aggiornare le variabili d'ambiente su Vercel**

L'utente deve, nel pannello Vercel del progetto (Settings → Environment Variables, o la pagina "Environments" a seconda di come si presenta l'interfaccia in quel momento — vedi le istruzioni già usate per `NEXT_PUBLIC_APP_URL` in precedenza in questo progetto):
- Aggiungere `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY` (stessi valori del Task 1), per tutti e tre gli ambienti (Production, Preview, Development)
- Rimuovere `GOOGLE_SHEETS_FINANCE_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`

Poi rifare il deploy (menu "..." sull'ultimo deployment → Redeploy) perché le variabili si leggono solo al momento della build.

- [ ] **Step 4: Verificare in produzione**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST -H "x-api-secret: $API_SECRET" https://elyra-memoria.vercel.app/api/finanze/aggiorna
```

Expected: stesso shape verificato nel Task 2 (`istantanea.conti`, `totale_personale`, `totale_lavoro`), con dati reali. Poi apri `https://elyra-memoria.vercel.app/` da loggato e conferma visivamente sia che la card Polso finanziario mostri i due totali (Task 4), sia che il gauge "Patrimonio" nella `TopBar` mostri una percentuale senza errori (Task 3).

- [ ] **Step 5: Riferire il risultato all'utente**

Riassumi cosa è stato verificato (rotte, dati reali, interfaccia) e chiedi conferma che i numeri mostrati combacino con quello che l'utente vede nella Dashboard di Contabilità di Odoo.

---

## Note per chi esegue questo piano

- Il Task 1 è quello con più incognite reali (nome esatto dei modelli/campi Odoo per la versione specifica dell'utente). Non saltarlo né semplificarlo: se il saldo letto da Odoo non torna, ogni task successivo mostrerà numeri sbagliati senza che sia ovvio il perché.
- Segui l'ordine dei task: ognuno dipende dal precedente (Task 2 usa `lib/odoo.js` del Task 1; Task 3 e Task 4 usano `leggiUltimoPolso()` aggiornata dal Task 2; Task 6 richiede che tutto funzioni in locale prima del deploy).
- Un commit per task finito, mai a metà — stesso principio già seguito in tutto il resto di questo progetto (vedi `git log`).
