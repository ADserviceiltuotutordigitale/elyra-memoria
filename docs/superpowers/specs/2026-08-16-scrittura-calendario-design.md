# Scrittura sul Calendario da cattura naturale

## Contesto

Il Calendario oggi legge in sola lettura un indirizzo iCal del Google
Calendar personale dell'utente (`lib/ical.js`, `GOOGLE_CALENDAR_ICAL_URL`).
Non esiste alcuna capacità di scrittura. Il classificatore (`lib/classify.js`)
ha solo 5 destinazioni possibili (task/persone/finanze/obiettivi/memoria):
"fissare un appuntamento" non ha una casa, quindi finisce nella categoria
che gli somiglia di più (es. "persone", se nomina qualcuno) invece di
creare un evento.

Episodio che ha fatto emergere il problema: scritto a Telegram "fissare che
il 24 agosto devo fare una consegna al Dott. Paolo Cecchini", il bot ha
risposto "Archiviato in persone: ...", senza alcun evento creato.

## Obiettivo

Dire "fissa un appuntamento il 24 agosto per la consegna a Cecchini" (da
Telegram o dalla barra di cattura della dashboard) deve creare un evento
vero sul Google Calendar reale dell'utente — lo stesso che il Calendario
già mostra. Se manca l'orario, **da Telegram** il bot lo chiede e aspetta
la risposta prima di creare l'evento; **dalla dashboard** (nessuna
conversazione a più messaggi possibile in quel contesto) l'evento viene
creato "tutto il giorno" per default.

## Cosa serve dall'utente

- Un account di servizio Google dedicato al Calendario (stesso meccanismo
  già usato in passato per i Fogli, ma con permessi solo sul Calendario —
  è accettabile creare un account di servizio nuovo invece di riusare
  quello vecchio, ormai rimosso dal progetto insieme all'integrazione
  Google Sheets).
- Condividere il proprio Google Calendar con l'email dell'account di
  servizio, permesso **"Apportare modifiche agli eventi"**.
- L'ID del calendario da scrivere (per un calendario personale è di solito
  il proprio indirizzo email, es. `ambrosi.davide89@gmail.com`).

## Architettura

```
Elyra (Vercel) --[REST v3, JWT service-account]--> Google Calendar API
```

### `lib/googleCalendar.js` (nuovo, server-only)

Nessuna dipendenza npm nuova: firma il JWT del service account con il
modulo nativo `crypto` di Node (stesso spirito di `lib/odoo.js` — niente
SDK pesanti dove basta `fetch` e crittografia nativa).

```js
export async function creaEventoCalendario({ titolo, data, ora })
// ora: { ore: number, minuti: number } | null — null = tutto il giorno
// → Promise<{ id: string, link: string }>
```

Variabili d'ambiente nuove: `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CALENDAR_ID` (i primi due nomi sono
gli stessi già usati in passato per Sheets — repurposed, non è un
conflitto perché quell'integrazione non esiste più).

### `lib/classify.js` — sesta destinazione

`DESTINAZIONI` diventa `["task", "persone", "finanze", "obiettivi", "memoria", "calendario"]`.
Il prompt di sistema guadagna una riga per "calendario: un appuntamento o
impegno con una data" e lo schema JSON di risposta guadagna due campi,
popolati solo quando `destinazione: "calendario"`:

```json
{"destinazione":"calendario","titolo":"...","persona":null,"urgenza":"...",
 "data":"2026-08-24","ora":"15:00"}
```

`data` sempre presente quando la destinazione è calendario (formato
`YYYY-MM-DD`, dedotta dal testo — "il 24 agosto" nell'anno corrente o
successivo se la data è già passata). `ora` è la stringa `HH:MM` se
menzionata nel testo, altrimenti `null`. La rete di sicurezza a regole
(`classificaConRegole`) non prova a dedurre una data — se il modello non è
disponibile, un tentativo di fissare un appuntamento finisce come "task"
semplice (comportamento di oggi, non peggiorativo: non è mai stato
possibile crearlo comunque senza il modello).

### `lib/capture.js` — gestione della destinazione "calendario"

Quando `classify()` ritorna `destinazione: "calendario"`:

- **Se `ora` è presente**: crea subito l'evento (`creaEventoCalendario`)
  con quell'orario, ritorna un risultato con l'evento creato.
- **Se `ora` è assente**: **non crea nulla ancora**. Ritorna
  `{ destinazione: "calendario", richiestaOrario: true, titolo, data }` —
  è compito di chi ha chiamato `eseguiCattura` (il webhook Telegram o la
  rotta di cattura della dashboard) decidere cosa fare quando l'orario
  manca, perché le due strade hanno capacità diverse (vedi sotto).

### Telegram — chiede l'orario e aspetta

Nuova colonna su `profilo` (riga singola per utente, stesso pattern di
`abitudini`/`obiettivo_calorico_giornaliero`): `calendario_pendente JSONB`,
`{ titolo, data, chiestoAlle }` oppure `null`.

Migrazione da far eseguire all'utente in Supabase (SQL Editor):

```sql
alter table profilo add column if not exists calendario_pendente jsonb;
```

Nel webhook (`app/api/telegram/webhook/route.js`), **prima** del controllo
`eDomanda` (una risposta breve come "tutto il giorno" o "alle 15" non deve
essere scambiata per una domanda o finire in cattura):

```
0. C'è un calendario_pendente non scaduto (< 10 minuti da chiestoAlle)?
     → chiedi al modello se questo messaggio è una risposta con un orario
       o "tutto il giorno" per quella richiesta pendente
     → se sì: crea l'evento (orario dedotto, o tutto il giorno), svuota
       calendario_pendente, conferma
     → se no: procedi normalmente (lascia perdere la richiesta pendente,
       che scadrà da sola — non è un errore, l'utente può aver cambiato
       discorso)
1. eDomanda?                    → risponde (invariato)
2. rilevaAzioneSuTask?          → agisce sul task (invariato)
3. eseguiCattura(testo, ...)
     → se richiestaOrario: true, salva { titolo, data, chiestoAlle: ora }
       in profilo.calendario_pendente, rispondi
       "A che ora il <data>? (scrivi un orario, o 'tutto il giorno')"
     → altrimenti: comportamento di oggi (evento già creato se
       destinazione calendario con orario, o "Archiviato in ..." per le
       altre destinazioni)
```

### Dashboard (barra di cattura) — nessuna attesa, default tutto il giorno

`lib/capture.js` stesso gestisce il caso `richiestaOrario: true` **solo
quando la chiamata non viene dal webhook Telegram** creando comunque
l'evento, ma tutto il giorno, invece di ritornare la richiesta in sospeso —
la barra di cattura della dashboard non ha un canale per "aspettare la
prossima risposta". La differenza tra i due comportamenti è nel parametro
`provenienza` che `eseguiCattura` già riceve (`"telegram"` vs
`"dashboard"`, esistente): solo quando `provenienza === "telegram"`
`eseguiCattura` ritorna `richiestaOrario: true` senza creare l'evento;
altrimenti crea comunque l'evento tutto il giorno.

## Cosa NON cambia

- `lib/ical.js`, la lettura del Calendario — invariata, resta sola lettura
  dallo stesso indirizzo iCal.
- Le altre 5 destinazioni di `classify()` — invariate.
- `lib/azioni.js` (azioni su task esistenti) — invariato, non tocca il
  calendario.

## Fuori scope (non in questa iterazione)

- Modificare o eliminare eventi già creati (solo creazione).
- Eventi ricorrenti.
- Promemoria/notifiche sull'evento creato.
- Gestire più di una richiesta di orario pendente alla volta (con un solo
  utente Telegram autorizzato, non serve).
