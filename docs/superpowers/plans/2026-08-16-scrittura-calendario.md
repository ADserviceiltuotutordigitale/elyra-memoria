# Scrittura sul Calendario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dire "fissa un appuntamento il 24 agosto" (da Telegram o dalla dashboard) crea un evento vero sul Google Calendar reale dell'utente, chiedendo l'orario da Telegram se manca.

**Architecture:** Un nuovo modulo `lib/googleCalendar.js` (JWT di un account di servizio Google, firmato con `crypto` nativo, nessuna dipendenza npm) crea eventi via REST v3. `lib/classify.js` guadagna una sesta destinazione ("calendario") che estrae anche data e orario. `lib/capture.js` decide se creare subito l'evento o segnalare che manca l'orario. Solo il webhook Telegram gestisce l'attesa della risposta con l'orario (nuova colonna `calendario_pendente` su `profilo`); la cattura da dashboard crea sempre l'evento, tutto il giorno se l'orario manca.

**Tech Stack:** Next.js 16 (App Router, JavaScript), Google Calendar API v3 (REST, JWT service-account, nessun SDK), Claude Haiku (stesso pattern di `lib/classify.js`/`lib/azioni.js`).

## Global Constraints

- Solo creazione di eventi — nessuna modifica o eliminazione dalla funzionalità finale (la cancellazione di record di test durante la verifica è un'altra cosa, non fa parte del codice spedito).
- Nessuna dipendenza npm nuova — JWT firmato a mano con `crypto` di Node, chiamate con `fetch`.
- `lib/ical.js` (lettura del Calendario) resta invariata.
- Da Telegram: se manca l'orario, si chiede e si aspetta la risposta (stato in `profilo.calendario_pendente`, scade dopo 10 minuti). Dalla dashboard: se manca l'orario, l'evento è creato subito, tutto il giorno.
- JavaScript, non TypeScript.
- Nessun framework di test automatico — verifica via `curl` contro il server dev locale e controllo diretto su Google Calendar/Supabase.

---

### Task 1: `lib/googleCalendar.js` — client Calendar API

**Files:**
- Create: `lib/googleCalendar.js`
- Create (temporaneo, rimosso a fine task): `app/api/debug-calendar/route.js`

**Interfaces:**
- Produces: `export async function creaEventoCalendario({ titolo, data, ora })` — `data` è una stringa `AAAA-MM-GG`, `ora` è `{ ore: number, minuti: number } | null` (`null` = tutto il giorno). Ritorna `Promise<{ id: string, link: string }>`.

- [ ] **Step 1: Raccogliere le credenziali dall'utente**

Serve un account di servizio Google **nuovo**, dedicato al Calendario (quello usato in passato per i Fogli non esiste più nel progetto). Guida l'utente:

1. Vai su [console.cloud.google.com](https://console.cloud.google.com), scegli o crea un progetto.
2. Abilita **Google Calendar API** (menu "API e servizi" → "Libreria" → cerca "Google Calendar API" → Abilita).
3. "API e servizi" → "Credenziali" → "Crea credenziali" → "Account di servizio". Dagli un nome (es. "elyra-calendario"), crealo.
4. Apri l'account di servizio appena creato → scheda "Chiavi" → "Aggiungi chiave" → "Crea nuova chiave" → formato **JSON** → scarica il file.
5. Dal file JSON scaricato, prendi i campi `client_email` e `private_key`.
6. Vai su [calendar.google.com](https://calendar.google.com), impostazioni del calendario che vuoi usare → "Condividi con persone specifiche" → aggiungi l'email del passo 5 con permesso **"Apportare modifiche agli eventi"**.
7. L'ID del calendario è di solito il tuo indirizzo email personale (quello del calendario che hai appena condiviso).

Aggiungi a `.env.local`:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email dal JSON>
GOOGLE_SERVICE_ACCOUNT_KEY="<private_key dal JSON, con gli \n letterali così come sono nel file>"
GOOGLE_CALENDAR_ID=<indirizzo email del calendario condiviso>
```

- [ ] **Step 2: Scrivere `lib/googleCalendar.js`**

```js
import "server-only";
import crypto from "crypto";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const FUSO = process.env.USER_TIMEZONE || "Europe/Rome";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Autenticazione a account di servizio (RFC 7523): un JWT firmato con la
// chiave privata scambiato con un access token — niente libreria googleapis,
// solo crypto nativo e fetch, come lib/odoo.js per Odoo.
async function ottieniAccessToken() {
  const ora = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: ora,
    exp: ora + 3600,
  };
  const datiFirmati = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const firma = crypto.createSign("RSA-SHA256").update(datiFirmati).sign(SERVICE_ACCOUNT_KEY);
  const jwt = `${datiFirmati}.${base64url(firma)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!body.access_token) {
    throw new Error(
      `[google-calendar] token non ottenuto: ${body.error_description || body.error || "errore sconosciuto"}`
    );
  }
  return body.access_token;
}

export async function creaEventoCalendario({ titolo, data, ora }) {
  const accessToken = await ottieniAccessToken();

  const evento = { summary: titolo };
  if (ora) {
    const inizio = `${data}T${String(ora.ore).padStart(2, "0")}:${String(ora.minuti).padStart(2, "0")}:00`;
    const fineDate = new Date(inizio);
    fineDate.setHours(fineDate.getHours() + 1);
    const fine = `${data}T${String(fineDate.getHours()).padStart(2, "0")}:${String(fineDate.getMinutes()).padStart(2, "0")}:00`;
    evento.start = { dateTime: inizio, timeZone: FUSO };
    evento.end = { dateTime: fine, timeZone: FUSO };
  } else {
    const [y, m, d] = data.split("-").map(Number);
    const giornoDopo = new Date(Date.UTC(y, m - 1, d));
    giornoDopo.setUTCDate(giornoDopo.getUTCDate() + 1);
    evento.start = { date: data };
    evento.end = { date: giornoDopo.toISOString().slice(0, 10) };
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(evento),
    }
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`[google-calendar] creazione evento fallita: ${body.error?.message || res.status}`);
  }
  return { id: body.id, link: body.htmlLink };
}
```

- [ ] **Step 3: Creare la rotta di debug temporanea (con pulizia inclusa)**

Crea `app/api/debug-calendar/route.js`:

```js
import crypto from "crypto";
import { creaEventoCalendario } from "@/lib/googleCalendar";

export async function POST(request) {
  const { titolo, data, ora } = await request.json();
  try {
    const evento = await creaEventoCalendario({ titolo, data, ora: ora || null });
    return Response.json({ ok: true, evento });
  } catch (err) {
    return Response.json({ ok: false, errore: err.message }, { status: 500 });
  }
}

// Solo per la pulizia dei test di questo task — ripete la firma del JWT
// autonomamente perché ottieniAccessToken() non è esportata da
// lib/googleCalendar.js (l'eliminazione non fa parte della funzionalità).
export async function DELETE(request) {
  const { eventId } = await request.json();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  function base64url(input) {
    return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  const ora = Math.floor(Date.now() / 1000);
  const datiFirmati = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
      iat: ora,
      exp: ora + 3600,
    })
  )}`;
  const firma = crypto.createSign("RSA-SHA256").update(datiFirmati).sign(key);
  const jwt = `${datiFirmati}.${base64url(firma)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const { access_token } = await tokenRes.json();

  const delRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${access_token}` } }
  );
  return Response.json({ ok: delRes.ok || delRes.status === 410, status: delRes.status });
}
```

- [ ] **Step 4: Verificare la creazione con un evento con orario**

Avvia il server dev (`npm run dev`), poi:

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"titolo": "TEST elyra-calendario — cancellami", "data": "2026-09-01", "ora": {"ore": 15, "minuti": 30}}' \
  http://localhost:3000/api/debug-calendar
```

Expected: `"ok": true`, `evento.id` e `evento.link` valorizzati. Apri `evento.link` (o guarda direttamente il tuo Google Calendar il 1° settembre 2026) e conferma che l'evento esista, con l'orario 15:30–16:30 e il fuso corretto.

Annota l'`id` restituito.

- [ ] **Step 5: Verificare la creazione di un evento tutto il giorno**

```bash
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"titolo": "TEST elyra-calendario tutto il giorno — cancellami", "data": "2026-09-02", "ora": null}' \
  http://localhost:3000/api/debug-calendar
```

Expected: `"ok": true`. Conferma nel calendario che l'evento del 2 settembre 2026 sia "tutto il giorno" (non abbia un orario specifico, e non si estenda erroneamente su due giorni). Annota anche questo `id`.

- [ ] **Step 6: Cancellare entrambi gli eventi di test**

```bash
curl -s -X DELETE -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"eventId": "<ID_PRIMO_EVENTO>"}' http://localhost:3000/api/debug-calendar
curl -s -X DELETE -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"eventId": "<ID_SECONDO_EVENTO>"}' http://localhost:3000/api/debug-calendar
```

Expected: `"ok": true` per entrambi. Conferma visivamente che i due eventi di test non compaiano più nel calendario.

- [ ] **Step 7: Rimuovere la rotta di debug**

```bash
rm -rf "C:/000_Cowork_Claude/Elyra_Memoria/app/api/debug-calendar"
```

- [ ] **Step 8: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/googleCalendar.js
git commit -m "Aggiunge lib/googleCalendar.js — client REST per creare eventi via account di servizio"
```

---

### Task 2: `lib/classify.js` — sesta destinazione "calendario"

**Files:**
- Modify: `lib/classify.js`
- Modify: `components/CaptureBar.jsx`

**Interfaces:**
- Consumes: `oggiISO()` da `lib/date.js` (già esistente).
- Produces: `DESTINAZIONI` include ora `"calendario"`. `classify(testo)` ritorna anche `data: string|null` e `ora: string|null` (formato `"HH:MM"`) oltre ai campi esistenti (`destinazione`, `titolo`, `persona`, `urgenza`, `via`).
- Produces: `export async function interpretaOrarioRisposta(testo)` → `Promise<{ capito: boolean, ora: string|null }>` — `ora` in formato `"HH:MM"`, `null` se "tutto il giorno"; `capito: false` se il testo non sembra affatto una risposta su un orario.

- [ ] **Step 1: Aggiornare `DESTINAZIONI` e importare `oggiISO`**

In cima al file, aggiungi l'import:

```js
import { oggiISO } from "./date";
```

Cambia:

```js
export const DESTINAZIONI = ["task", "persone", "finanze", "obiettivi", "memoria"];
```

in:

```js
export const DESTINAZIONI = ["task", "persone", "finanze", "obiettivi", "memoria", "calendario"];
```

- [ ] **Step 2: Aggiornare `SYSTEM_PROMPT`**

Sostituisci l'intera costante con:

```js
const SYSTEM_PROMPT = `Sei il classificatore di Elyra, un sistema personale di note e task.
Ricevi una frase scritta o detta a voce e decidi dove va archiviata.
Oggi è {{OGGI}} (formato AAAA-MM-GG).

Destinazioni possibili, una sola:
- task: un'azione generica da fare, senza una casa più precisa
- persone: qualcosa legato a una persona specifica (richiamare, rispondere, contattare)
- finanze: spese, pagamenti, entrate, importi in denaro
- obiettivi: una promessa o un traguardo, non un'azione immediata
- memoria: un pensiero, una riflessione, qualcosa da ricordare senza azione
- calendario: un appuntamento o impegno con una data specifica (anche "il 24 agosto", "domani", "lunedì prossimo")

Urgenza, una sola tra: "oggi", "settimana", "piu_avanti".
Se non è chiaro, usa "oggi". Non usare mai "in_ritardo": ci si finisce restando
fermi, non è un valore che assegni tu.

Se destinazione è "calendario": deduci la data assoluta menzionata nel testo
(formato AAAA-MM-GG, usando la data di oggi sopra come riferimento — es. "il 24
agosto" è il prossimo 24 agosto da oggi in poi, mai una data già passata) e
mettila nel campo "data" (sempre presente per questa destinazione). Se nel
testo è menzionato anche un orario, mettilo nel campo "ora" in formato "HH:MM"
(24 ore); altrimenti "ora": null. Per ogni altra destinazione, "data" e "ora"
sono sempre null.

Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con questa forma:
{"destinazione": "...", "titolo": "riformulazione breve", "persona": "nome o null", "urgenza": "...", "data": "AAAA-MM-GG o null", "ora": "HH:MM o null"}`;
```

- [ ] **Step 3: Aggiornare `classificaConRegole` e `classify`**

In `classificaConRegole`, aggiungi `data: null, ora: null,` al risultato:

```js
function classificaConRegole(testo) {
  const minuscolo = testo.toLowerCase();
  const regola = REGOLE.find((r) => r.parole.some((p) => minuscolo.includes(p)));
  return {
    destinazione: regola?.destinazione ?? "task",
    titolo: testo.length > 80 ? testo.slice(0, 77) + "…" : testo,
    persona: null,
    urgenza: URGENZA_PREDEFINITA,
    data: null,
    ora: null,
    via: "regole",
  };
}
```

In `classify`, interpola `{{OGGI}}` nella chiamata al modello:

```js
    risposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT.replace("{{OGGI}}", oggiISO()),
      messages: [{ role: "user", content: testo }],
    });
```

E aggiungi `data`/`ora` al valore di ritorno finale:

```js
  return {
    destinazione: parsed.destinazione,
    titolo: parsed.titolo || testo,
    persona: parsed.persona || null,
    urgenza: normalizzaUrgenza(parsed.urgenza),
    data: parsed.data || null,
    ora: parsed.ora || null,
    via: "modello",
  };
```

- [ ] **Step 4: Aggiungere `interpretaOrarioRisposta`**

In fondo al file:

```js
const SYSTEM_PROMPT_ORARIO = `Il messaggio è una risposta alla domanda "a che ora?" per un evento di
calendario.
Se indica un orario, rispondi {"capito": true, "ora": "HH:MM"} (24 ore).
Se dice che è un impegno per tutto il giorno (es. "tutto il giorno", "nessun
orario", "giornata intera"), rispondi {"capito": true, "ora": null}.
Se il messaggio non sembra affatto una risposta su un orario, rispondi
{"capito": false, "ora": null}.
Rispondi SOLO con l'oggetto JSON, senza testo prima o dopo.`;

export async function interpretaOrarioRisposta(testo) {
  if (!anthropic) return { capito: false, ora: null };

  let risposta;
  try {
    risposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 100,
      system: SYSTEM_PROMPT_ORARIO,
      messages: [{ role: "user", content: testo }],
    });
  } catch {
    return { capito: false, ora: null };
  }

  const testoRisposta = risposta.content
    .filter((blocco) => blocco.type === "text")
    .map((blocco) => blocco.text)
    .join("");

  const parsed = estraiJson(testoRisposta);
  if (!parsed || typeof parsed.capito !== "boolean") return { capito: false, ora: null };
  return { capito: parsed.capito, ora: parsed.ora || null };
}
```

- [ ] **Step 5: Aggiungere l'etichetta "calendario" in `components/CaptureBar.jsx`**

In `ETICHETTE_DESTINAZIONE`, aggiungi la voce mancante:

```js
const ETICHETTE_DESTINAZIONE = {
  task: "task",
  persone: "persone",
  finanze: "finanze",
  obiettivi: "obiettivi",
  memoria: "memoria",
  calendario: "calendario",
};
```

- [ ] **Step 6: Verificare con curl**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
```

Crea un file temporaneo di test Node (non fa parte del progetto, solo per questa verifica) oppure usa direttamente la rotta di cattura esistente, che chiama `classify()` al suo interno:

```bash
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"testo": "fissa un appuntamento il 1 settembre alle 15 e 30 per il ritiro del materiale TESTCLASSIFY"}' \
  http://localhost:3000/api/capture
```

**Attenzione**: questa chiamata userà `eseguiCattura`, che nel Task 3 creerà davvero l'evento — per ora (prima del Task 3) la destinazione "calendario" non ha ancora un branch dedicato in `lib/capture.js`, quindi non succede nulla di scritto oltre al log in `catture`/`memoria`. Verifica invece **solo la classificazione** controllando la riga appena scritta in `catture`:

```bash
SUPA_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
SUPA_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s "$SUPA_URL/rest/v1/catture?testo_grezzo=ilike.*TESTCLASSIFY*&select=classificazione&order=created_at.desc&limit=1" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"
```

Expected: `classificazione.destinazione` è `"calendario"`, `classificazione.data` è `"2026-09-01"`, `classificazione.ora` è `"15:30"`. Poi cancella quella riga di test:

```bash
curl -s -X DELETE "$SUPA_URL/rest/v1/catture?testo_grezzo=ilike.*TESTCLASSIFY*" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"
```

- [ ] **Step 7: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/classify.js components/CaptureBar.jsx
git commit -m "classify(): sesta destinazione 'calendario' con estrazione di data/ora"
```

---

### Task 3: `lib/capture.js` — creare l'evento o segnalare l'orario mancante

**Files:**
- Modify: `lib/capture.js`

**Interfaces:**
- Consumes: `creaEventoCalendario({titolo, data, ora})` da `lib/googleCalendar.js` (Task 1); `classify()`'s nuovi campi `data`/`ora` (Task 2).
- Produces: `eseguiCattura(testo, {provenienza})` può ora ritornare anche `richiestaOrario: true` insieme a `data`/`titolo` quando `provenienza === "telegram"` e manca l'orario per un evento di calendario. In tutti gli altri casi la forma di ritorno è invariata (più i campi `data`/`ora` che `classify()` già aggiunge a `risultato`).

- [ ] **Step 1: Aggiungere l'import**

```js
import { creaEventoCalendario } from "./googleCalendar";
```

- [ ] **Step 2: Aggiungere il branch "calendario"**

Nel blocco `if (risultato.destinazione === "task" ...) { ... } else if (risultato.destinazione === "obiettivi") { ... }`, aggiungi un ramo:

```js
  } else if (risultato.destinazione === "calendario") {
    if (!risultato.ora && provenienza === "telegram") {
      return { ...risultato, task, richiestaOrario: true };
    }
    const ora = risultato.ora
      ? (() => {
          const [ore, minuti] = risultato.ora.split(":").map(Number);
          return { ore, minuti };
        })()
      : null;
    await creaEventoCalendario({ titolo: risultato.titolo, data: risultato.data, ora });
  }
```

Il file risultante (solo la parte che cambia):

```js
  let task = null;
  if (risultato.destinazione === "task" || risultato.destinazione === "persone") {
    const personaId = await trovaOCreaPersona(risultato.persona);
    task = await addTask({
      titolo: risultato.titolo,
      fascia: risultato.urgenza,
      persona_id: personaId,
    });
  } else if (risultato.destinazione === "obiettivi") {
    await aggiungiObiettivo(risultato.titolo);
  } else if (risultato.destinazione === "calendario") {
    if (!risultato.ora && provenienza === "telegram") {
      return { ...risultato, task, richiestaOrario: true };
    }
    const ora = risultato.ora
      ? (() => {
          const [ore, minuti] = risultato.ora.split(":").map(Number);
          return { ore, minuti };
        })()
      : null;
    await creaEventoCalendario({ titolo: risultato.titolo, data: risultato.data, ora });
  }

  return { ...risultato, task };
```

- [ ] **Step 3: Verificare — cattura da dashboard con orario**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"testo": "fissa un appuntamento il 3 settembre alle 10 per la consegna TESTCAPTURE1"}' \
  http://localhost:3000/api/capture
```

Expected: risposta con `destinazione: "calendario"`, nessun `richiestaOrario` (provenienza è "dashboard" di default). Verifica nel tuo Google Calendar che l'evento del 3 settembre alle 10:00 esista con quel titolo, poi cancellalo a mano.

- [ ] **Step 4: Verificare — cattura da dashboard senza orario (deve creare comunque, tutto il giorno)**

```bash
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"testo": "fissa un appuntamento il 4 settembre per la consegna TESTCAPTURE2"}' \
  http://localhost:3000/api/capture
```

Expected: nessun `richiestaOrario` nella risposta (provenienza "dashboard"). Verifica che l'evento del 4 settembre sia stato creato tutto il giorno, poi cancellalo a mano.

- [ ] **Step 5: Verificare — cattura con `provenienza: "telegram"` senza orario (deve SOLO segnalare, non creare)**

```bash
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"testo": "fissa un appuntamento il 5 settembre per la consegna TESTCAPTURE3", "provenienza": "telegram"}' \
  http://localhost:3000/api/capture
```

Expected: la risposta contiene `"richiestaOrario": true`, `"data": "2026-09-05"`. Verifica nel Google Calendar che **nessun evento** sia stato creato per il 5 settembre con quel titolo — questo è il comportamento corretto (l'evento si crea solo dopo la risposta con l'orario, gestita nel Task 4).

- [ ] **Step 6: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/capture.js
git commit -m "eseguiCattura: crea l'evento calendario, o segnala richiestaOrario da Telegram"
```

---

### Task 4: Telegram — chiede l'orario e lo aspetta

**Files:**
- Modify: `app/api/telegram/webhook/route.js`

**Interfaces:**
- Consumes: `eseguiCattura`'s campo `richiestaOrario` (Task 3); `interpretaOrarioRisposta(testo)` da `lib/classify.js` (Task 2); `creaEventoCalendario` da `lib/googleCalendar.js` (Task 1); `getProfilo()`/`updateProfilo(patch)` da `lib/store.js` (già esistenti, non ancora importate in questo file).

- [ ] **Step 1: Migrazione Supabase (azione utente)**

Chiedi all'utente di eseguire questo SQL nell'SQL Editor di Supabase:

```sql
alter table profilo add column if not exists calendario_pendente jsonb;
```

- [ ] **Step 2: Aggiornare gli import in `app/api/telegram/webhook/route.js`**

```js
import { eseguiCattura } from "@/lib/capture";
import { rispondiADomanda } from "@/lib/domande";
import { eDomanda } from "@/lib/testo";
import { rilevaAzioneSuTask } from "@/lib/azioni";
import { interpretaOrarioRisposta } from "@/lib/classify";
import { creaEventoCalendario } from "@/lib/googleCalendar";
import { updateTask, completeTask, deleteTask, getProfilo, updateProfilo } from "@/lib/store";
```

- [ ] **Step 3: Aggiungere il controllo della richiesta pendente, prima di `eDomanda`**

Subito dopo il controllo `if (!testo || !testo.trim()) return;` e prima di `if (eDomanda(testo)) {`:

```js
  const DIECI_MINUTI_MS = 10 * 60 * 1000;
  const profilo = await getProfilo();
  const pendente = profilo.calendario_pendente;
  if (pendente && Date.now() - new Date(pendente.chiestoAlle).getTime() < DIECI_MINUTI_MS) {
    const { capito, ora } = await interpretaOrarioRisposta(testo);
    if (capito) {
      const oraStrutturata = ora
        ? (() => {
            const [ore, minuti] = ora.split(":").map(Number);
            return { ore, minuti };
          })()
        : null;
      await creaEventoCalendario({ titolo: pendente.titolo, data: pendente.data, ora: oraStrutturata });
      await updateProfilo({ calendario_pendente: null });
      await inviaMessaggio(
        chatId,
        `Fissato: "${pendente.titolo}" il ${pendente.data}${ora ? " alle " + ora : " (tutto il giorno)"}`
      );
      return;
    }
    // Non è una risposta sull'orario: prosegue normalmente. La richiesta
    // pendente resta (scadrà da sola dopo 10 minuti) — l'utente potrebbe
    // semplicemente aver cambiato discorso.
  }
```

- [ ] **Step 4: Gestire `richiestaOrario` dopo `eseguiCattura`**

Sostituisci:

```js
  const risultato = await eseguiCattura(testo, { provenienza: "telegram" });
  const tastiera = risultato.task ? tastieraUrgenza(risultato.task.id) : undefined;

  await inviaMessaggio(chatId, `Archiviato in ${risultato.destinazione}: "${risultato.titolo}"`, tastiera);
```

con:

```js
  const risultato = await eseguiCattura(testo, { provenienza: "telegram" });

  if (risultato.richiestaOrario) {
    await updateProfilo({
      calendario_pendente: { titolo: risultato.titolo, data: risultato.data, chiestoAlle: new Date().toISOString() },
    });
    await inviaMessaggio(chatId, `A che ora il ${risultato.data}? (scrivi un orario, o "tutto il giorno")`);
    return;
  }

  if (risultato.destinazione === "calendario") {
    await inviaMessaggio(
      chatId,
      `Fissato: "${risultato.titolo}" il ${risultato.data}${risultato.ora ? " alle " + risultato.ora : " (tutto il giorno)"}`
    );
    return;
  }

  const tastiera = risultato.task ? tastieraUrgenza(risultato.task.id) : undefined;
  await inviaMessaggio(chatId, `Archiviato in ${risultato.destinazione}: "${risultato.titolo}"`, tastiera);
```

- [ ] **Step 5: Verificare end-to-end — orario mancante poi fornito**

Avvia il server dev. Simula il primo messaggio (stesso pattern usato per verificare le azioni Telegram sui task in una fase precedente di questo progetto — header `x-telegram-bot-api-secret-token`, `message.from.id`/`message.chat.id` uguali a `TELEGRAM_USER_ID`):

```bash
TELEGRAM_WEBHOOK_SECRET=$(grep "^TELEGRAM_WEBHOOK_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
TELEGRAM_USER_ID=$(grep "^TELEGRAM_USER_ID=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST "http://localhost:3000/api/telegram/webhook" \
  -H "x-telegram-bot-api-secret-token: $TELEGRAM_WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d "{\"message\":{\"message_id\":1,\"from\":{\"id\":$TELEGRAM_USER_ID},\"chat\":{\"id\":$TELEGRAM_USER_ID},\"text\":\"fissa un appuntamento il 6 settembre per la consegna TESTWEBHOOK\"}}"
```

Expected: `{"ok": true}`. Controlla su Supabase che `profilo.calendario_pendente` sia valorizzato:

```bash
SUPA_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
SUPA_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s "$SUPA_URL/rest/v1/profilo?select=calendario_pendente" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY"
```

Expected: `{titolo: "...TESTWEBHOOK", data: "2026-09-06", chiestoAlle: "..."}`. Nessun evento deve ancora esistere nel Calendario per il 6 settembre.

Ora simula la risposta con l'orario:

```bash
curl -s -X POST "http://localhost:3000/api/telegram/webhook" \
  -H "x-telegram-bot-api-secret-token: $TELEGRAM_WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d "{\"message\":{\"message_id\":2,\"from\":{\"id\":$TELEGRAM_USER_ID},\"chat\":{\"id\":$TELEGRAM_USER_ID},\"text\":\"alle 11\"}}"
```

Expected: `{"ok": true}`. Verifica nel Calendario che l'evento del 6 settembre alle 11:00 sia stato creato. Verifica su Supabase che `profilo.calendario_pendente` sia tornato `null`. Cancella l'evento di test dal Calendario.

- [ ] **Step 6: Verificare — "tutto il giorno" come risposta**

Ripeti lo Step 5 dall'inizio con un'altra data (es. "il 7 settembre... TESTWEBHOOK2"), ma questa volta rispondi con `"text":"tutto il giorno"`. Expected: evento creato tutto il giorno il 7 settembre. Cancella l'evento di test.

- [ ] **Step 7: Verificare che una richiesta pendente non catturi un messaggio non correlato**

Ripeti l'inizio dello Step 5 (crea una nuova richiesta pendente, altra data/titolo), poi invece di rispondere con un orario manda un messaggio senza relazione, es. `"text":"comprare il latte"`. Expected: `interpretaOrarioRisposta` ritorna `capito: false`, il messaggio prosegue come cattura normale (dovrebbe archiviarsi come task "comprare il latte"), `calendario_pendente` resta quello di prima (non si tocca). Ripulisci sia il task creato sia — se vuoi — aspetta i 10 minuti o aggiorna a mano `calendario_pendente` a `null` su Supabase per non lasciare residui.

- [ ] **Step 8: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add app/api/telegram/webhook/route.js
git commit -m "Telegram: chiede l'orario mancante per un evento calendario e lo aspetta"
```

---

### Task 5: Deploy e verifica in produzione

**Files:** nessuno.

**Interfaces:** nessuna.

- [ ] **Step 1: Chiedere il permesso di fare push**

- [ ] **Step 2: Push**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git push origin master
```

- [ ] **Step 3: Aggiornare le variabili d'ambiente su Vercel**

L'utente deve aggiungere `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CALENDAR_ID` (stessi valori del Task 1) in Settings → Environment Variables, su tutti e tre gli ambienti, poi rifare il Redeploy.

- [ ] **Step 4: Verificare in produzione**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"testo": "fissa un appuntamento il 10 settembre alle 9 per il controllo TESTPROD"}' \
  https://elyra-memoria.vercel.app/api/capture
```

Expected: risposta con `destinazione: "calendario"`. Verifica nel Google Calendar reale che l'evento sia stato creato, poi cancellalo.

Non ripetere la verifica del flusso Telegram "chiede l'orario" in produzione con chiamate curl dirette al webhook: è già stata verificata end-to-end nel Task 4 contro lo stesso Google Calendar reale. Se vuoi un'ultima conferma, scrivi davvero a Telegram un messaggio tipo "fissa un appuntamento il 12 settembre per una prova" e rispondi quando il bot chiede l'orario — poi cancella l'evento di prova.

- [ ] **Step 5: Riferire il risultato all'utente**

---

## Note per chi esegue questo piano

- Ogni evento di test creato nel Calendario **va sempre cancellato subito dopo** — mai lasciare eventi di prova nel calendario reale dell'utente.
- Il Task 1 richiede credenziali reali che solo l'utente può fornire (account di servizio Google + condivisione del calendario) — non saltare lo Step 1, senza quelle nessun altro task è verificabile.
- Segui l'ordine dei task: il Task 3 dipende da `creaEventoCalendario` (Task 1) e dai campi `data`/`ora` di `classify()` (Task 2); il Task 4 dipende dal campo `richiestaOrario` (Task 3) e da `interpretaOrarioRisposta` (Task 2).
