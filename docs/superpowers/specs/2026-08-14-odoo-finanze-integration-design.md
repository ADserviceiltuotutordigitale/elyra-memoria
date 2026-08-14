# Integrazione Odoo per il Polso finanziario

## Contesto

Il Polso finanziario attuale legge un foglio Google Sheets e usa Claude per
estrarre patrimonio netto e categorie da una struttura non standardizzata
(Parte 5.8 della guida PersonalOS). L'utente ha 4 conti bancari reali (BBVA,
Revolut, WeBank — personali; Poste Italiane Business — lavoro) già collegati
e sincronizzati dentro un'istanza Odoo esistente, tramite Salt Edge (un
aggregatore Open Banking PSD2). Le chiavi Salt Edge appartengono a Odoo, non
all'utente: l'utente non ha accesso diretto a Salt Edge.

Percorso valutato e scartato: ricollegare le 4 banche direttamente via un
aggregatore Open Banking (GoCardless — non accetta più nuovi clienti dal
2025; Enable Banking — copertura non verificata per queste banche). Scartato
perché duplicherebbe una sincronizzazione che esiste già e funziona.

Percorso scelto: leggere i saldi direttamente da Odoo, che è il sistema su
cui l'utente ha credenziali proprie e accesso diretto.

## Obiettivo

Sostituire la fonte dati del Polso finanziario: da "foglio Google Sheets +
estrazione IA" a "saldi letti direttamente da Odoo via API esterna", con
separazione esplicita tra patrimonio personale e patrimonio lavoro.

## Cosa viene rimosso

- `lib/finanze.js`: la parte di lettura Google Sheets e l'estrazione via
  Claude (l'autenticazione JWT verso Google, `leggiFoglioComeTesto`,
  `aggiornaPolsoFinanziario` nella sua forma attuale)
- Variabili d'ambiente: `GOOGLE_SHEETS_FINANCE_ID`,
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`
- Dipendenza `googleapis` da `package.json`, se non usata altrove (verificare
  — al momento è usata solo da `lib/finanze.js`)

Non tocchiamo l'account di servizio Google lato Google Cloud Console:
l'utente lo disattiva/elimina da sé quando vuole, non è responsabilità del
codice.

## Architettura

```
Elyra (Vercel) --[JSON-RPC su HTTPS, chiave API]--> Odoo (istanza dell'utente)
```

- Nuovo modulo `lib/odoo.js` (server-only): client minimale per l'API
  esterna JSON-RPC di Odoo, senza dipendenze npm aggiuntive (fetch nativo).
  Due chiamate: `authenticate` (ottiene lo `uid` a partire da
  db/username/chiave API) ed `execute_kw` (per leggere `account.journal` e i
  saldi collegati).
- Autenticazione: chiave API Odoo (generata dall'utente in Impostazioni →
  Utenti e Aziende → Utenti → scheda "Chiavi API"), mai la password
  dell'account.
- Nuove variabili d'ambiente: `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`,
  `ODOO_API_KEY`.
- Mappatura conto → ambito: costante hardcoded in `lib/odoo.js` (4 conti
  fissi, non serve un'interfaccia di configurazione):
  ```js
  const MAPPATURA_CONTI = {
    "BBVA": "personale",
    "Revolut": "personale",
    "WeBank": "personale",
    "Poste Italiane Business": "lavoro", // nome esatto da confermare contro il giornale reale in Odoo
  };
  ```
  Il nome esatto di ogni giornale in Odoo va confermato durante
  l'implementazione (leggendo `account.journal` dell'istanza reale) e la
  mappatura aggiornata di conseguenza.

## Come si legge il saldo

Il modo esatto per ottenere il "saldo corrente" di un giornale bancario in
Odoo varia leggermente tra versioni (14/15/16/17/18) e non è un singolo
campo sempre disponibile allo stesso modo via API esterna — va verificato
contro l'istanza reale dell'utente durante l'implementazione. Le due strade
note, in ordine di preferenza:

1. Se il metodo usato dalla Dashboard di Contabilità per il "saldo banca"
   (qualcosa vicino a `get_journal_dashboard_datas` o equivalente per la
   versione in uso) è chiamabile via `execute_kw`, si usa quello: è lo
   stesso numero che l'utente vede già nella sua Dashboard Odoo, quindi
   coerente per costruzione.
2. In alternativa, si legge `account.journal` per ottenere il
   `default_account_id` di ogni giornale bancario, poi si sommano i
   `debit`/`credit` di `account.move.line` per quel conto (righe
   contabilizzate, `parent_state = 'posted'`).

Questa verifica è un passo dell'implementazione, non un blocco del design:
il resto del sistema (istantanea, delta, interfaccia) non dipende da quale
delle due strade funziona.

## Modello dati

Nuova forma dell'istantanea salvata in `log_giornaliero.finanze` (stesso
meccanismo di oggi — una riga per data, letta sempre dall'ultima istantanea,
mai dal caricamento della pagina):

```js
{
  generato_alle: "2026-08-14T09:00:00.000Z",
  conti: [
    { nome: "BBVA", saldo: 5230.10, ambito: "personale" },
    { nome: "Revolut", saldo: 1200.00, ambito: "personale" },
    { nome: "WeBank", saldo: 800.50, ambito: "personale" },
    { nome: "Poste Italiane Business", saldo: 14500.00, ambito: "lavoro" },
  ],
  totale_personale: 7230.60,
  totale_lavoro: 14500.00,
}
```

Rimosso rispetto a prima: `patrimonio_netto` unico, `valuta`,
`data_riferimento`, `categorie` con `tipo` (liquidita/investito/debito),
`note`. Non servono più: i dati sono strutturati ed esatti da Odoo, non c'è
ambiguità da segnalare come con l'estrazione da un foglio disordinato.

`leggiUltimoPolso()` in `lib/finanze.js` viene adattata di conseguenza:
calcola il delta di `totale_personale` e `totale_lavoro` separatamente
rispetto all'istantanea precedente trovata negli ultimi 30 giorni.

## Interfaccia

`components/PolsoFinanziarioCard.jsx` ridisegnata:

- Due totali affiancati — **Personale** e **Lavoro** — ciascuno con il
  proprio delta (▲/▼) rispetto al confronto precedente
- Sotto, la lista dei 4 conti con nome e saldo, raggruppati per ambito
- Pulsante "aggiorna" invariato nel comportamento: chiama Odoo solo al
  clic, mai al caricamento della pagina (stessa regola ferrea del Polso
  attuale — qui non si tratta di costo IA, ma resta la regola generale
  "niente chiamate esterne al caricamento")
- Ora dell'ultima istantanea, come oggi

## Cosa serve dall'utente

- URL dell'istanza Odoo (es. `https://nomeazienda.odoo.com`)
- Nome del database Odoo
- Il suo username Odoo
- Una chiave API generata da Impostazioni → Utenti e Aziende → Utenti →
  scheda "Chiavi API" (non la password)

## Fuori scope (non in questa iterazione)

- Aggiungere l'aggiornamento Odoo al cron notturno (oggi resta manuale, come
  il Polso attuale — estendibile in futuro seguendo lo stesso schema del
  briefing del mattino)
- Storico/grafici oltre al semplice delta rispetto alla istantanea
  precedente
- Gestione di conti aggiuntivi oltre ai 4 attuali (se cambiano, si aggiorna
  la mappatura hardcoded a mano)
