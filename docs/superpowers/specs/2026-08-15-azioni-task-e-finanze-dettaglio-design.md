# Azioni su task via Telegram + pagina Finanze dettagliata

## Parte 1 — Azioni su task via Telegram (rimuovi/completa)

### Contesto

Oggi il webhook Telegram (`gestisciMessaggio` in `app/api/telegram/webhook/route.js`)
riconosce solo due casi: **domanda** (`eDomanda()`, se finisce con "?" o inizia
con una parola interrogativa) e **cattura** (tutto il resto, sempre archiviato
come nuovo elemento tramite `classify()`). Scrivere "rimuovi il task X" non è
una domanda, quindi finisce nella cattura: il classificatore non conosce il
concetto di "elimina" e archivia un nuovo task che *descrive* la richiesta
invece di eseguirla. `deleteTask(id)` e `completeTask(id)` esistono già in
`lib/store.js` (li usa la CRM) — mancava solo un modo per Telegram di
raggiungerli tramite linguaggio naturale.

### Obiettivo

"Rimuovi/elimina/cancella il task X" e "completa/ho finito il task X" scritti
o detti a Telegram devono agire sul task esistente più simile, invece di
crearne uno nuovo. Se non c'è una corrispondenza sufficientemente chiara, il
bot risponde chiedendo di essere più precisi — non indovina e non crea nulla.

### Architettura

Nuovo modulo `lib/azioni.js` (server-only), stesso pattern di `lib/classify.js`
(Claude Haiku, nessuna dipendenza nuova):

```
export async function rilevaAzioneSuTask(testo)
```

- Legge i task aperti con `getTask()` (solo quelli non completati — coerente
  con l'unico stato che ha senso rimuovere/completare).
- Chiede a Claude, dato il testo e l'elenco `{id, titolo}` dei task aperti, di
  decidere: è un comando di rimozione o completamento riferito a uno di questi
  task? Se sì, quale id? Se il testo non è chiaramente un'azione, o non c'è
  un id abbastanza sicuro (ambiguo o nessuna corrispondenza), risponde `null`.
- Ritorna `{ azione: "elimina" | "completa" | null, taskId: string | null }`.
- Nessuna rete di sicurezza a regole qui (a differenza di `classify()`): se
  Claude non è disponibile o la chiamata fallisce, si considera `azione: null`
  e il testo prosegue verso la cattura normale — comportamento di oggi,
  invariato, mai peggiorativo.

### Integrazione nel webhook

In `gestisciMessaggio()`, tra il controllo `eDomanda()` e la cattura:

```
1. eDomanda(testo)?          → risponde (invariato)
2. rilevaAzioneSuTask(testo) → azione !== null?
     → esegue deleteTask/completeTask, risponde con conferma
3. altrimenti                → cattura (invariato)
```

Messaggi di risposta:
- Successo eliminazione: `Rimosso: "<titolo del task>"`
- Successo completamento: `Completato: "<titolo del task>"`
- Nessuna azione rilevata (incluso ambiguo/non trovato): il testo prosegue
  come cattura normale — **non** un messaggio di errore separato, perché a
  quel punto potrebbe semplicemente essere una nota normale che contiene per
  caso una parola come "completa". La distinzione fra "non è un'azione" e
  "azione ambigua" resta interna alla decisione del modello: se il modello
  vede chiaramente un'intenzione di azione ma non riesce a scegliere un id
  con sicurezza, deve comunque rispondere `azione: null` (fallback sicuro),
  e in quel caso il testo *verrà* archiviato come cattura — l'utente vedrà
  "Archiviato in task: ..." e capirà che deve riformulare in modo più
  specifico se voleva davvero eliminare qualcosa.

Questo mantiene il webhook semplice (nessuno stato di conversazione multi-turno
da gestire) e non rischia mai di cancellare il task sbagliato.

### Cosa NON cambia

- CaptureBar (dashboard web) non viene toccata: la richiesta riguarda solo
  Telegram.
- Nessuna azione su persone/obiettivi/memoria — solo task, come richiesto.
- `classify()` resta invariato.

---

## Parte 2 — Pagina Finanze a pagina intera

### Contesto

La pagina `/finanze` oggi mostra lo stesso `PolsoFinanziarioCard` compatto
della Home. L'utente vuole usare tutto lo spazio della pagina per informazioni
più dettagliate, incluso un andamento nel tempo. Oggi Odoo fornisce solo il
saldo attuale per conto; lo storico esiste già ma è scarno — una riga in
`log_giornaliero.finanze` per ogni giorno in cui è stato premuto "aggiorna",
accumulata a partire da questa settimana.

### Obiettivo

Una pagina `/finanze` dedicata con: i due totali (Personale/Lavoro) in
grande, un grafico dell'andamento nel tempo di entrambi i totali, e l'elenco
completo dei conti con nomi non troncati, raggruppati per ambito.

### Dati

Nuova funzione in `lib/finanze.js`:

```
export async function leggiStoricoPolso(giorni = 90)
```

Legge `getLogGiornalieroRange(giorniFa(oggi, giorni), oggi)`, filtra le righe
con uno snapshot valido (stesso filtro di `leggiUltimoPolso`:
`typeof r.finanze.totale_personale === "number"`), e ritorna un array
ordinato per data ascendente:

```js
[{ data: "2026-08-14", totale_personale: -2260.23, totale_lavoro: 341.52 }, ...]
```

Nuova rotta `GET /api/finanze/storico` che chiama solo questa funzione (mai
Odoo in diretta — stessa regola del resto del Polso). Risposta:
`{ storico: [...] }`.

### Interfaccia

Nuovo componente `components/FinanzeDettaglio.jsx` (non riusa
`PolsoFinanziarioCard` — quella resta la versione compatta per la Home),
usato solo da `app/(dashboard)/finanze/page.js`:

- **In alto:** due totali grandi (Personale/Lavoro) con delta, stile simile
  a oggi ma con tipografia più grande, sfruttando la larghezza della pagina.
- **Al centro:** un grafico a linee SVG fatto a mano (nessuna libreria di
  charting — coerente con lo stile del progetto, che disegna a mano ogni
  elemento grafico) con due linee (Personale/Lavoro) sull'asse del tempo,
  usando `leggiStoricoPolso()`. Con 1 solo punto disponibile mostra un
  singolo pallino con il valore; con pochi punti mostra semplicemente una
  linea spezzata fra i punti reali — nessun dato inventato o interpolato
  per riempire lo spazio.
- **In basso:** l'elenco completo dei conti, nome per esteso (non troncato,
  la pagina ha spazio), raggruppati sotto due intestazioni "Personale" e
  "Lavoro".
- Pulsante "aggiorna" e orario, invariati nel comportamento (chiama Odoo
  solo al clic, mai al caricamento — stessa regola ferrea di sempre).

### Cosa NON cambia

- `PolsoFinanziarioCard.jsx` (Home) resta la versione compatta, invariata.
- `lib/odoo.js`, `app/api/finanze/aggiorna/route.js` invariati.
- Nessuna nuova dipendenza npm.
