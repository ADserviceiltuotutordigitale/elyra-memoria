# Integrazione CRM Odoo

## Contesto

Oggi la scheda CRM (`components/CrmBoard.jsx`) mostra i task personali di
Elyra (tabella `task` su Supabase) in una board Kanban a 4 fasce
(In ritardo/Oggi/Settimana/Più avanti) più vista "Per persona", ricerca in
linguaggio naturale, drag&drop e un pannello di modifica. Mischia però cose
personali (es. "andare dal fisioterapista") e opportunità di vendita vere
(es. "preparare video per Kulzer") in un'unica lista semplice, senza fasi di
vendita reali.

Il modulo CRM di Odoo (istanza `ad-service.odoo.com`) è installato e attivo,
con dati reali: opportunità vere con cliente, valore, probabilità, priorità
e una pipeline a 5 fasi (`New` → `Qualified` → `Proposition` → `Won` /
`Annullata`, quest'ultima usata come "persa" in questa istanza — non un
meccanismo Odoo speciale, solo una fase come le altre).

## Obiettivo

`/crm` diventa la pipeline di vendita reale letta da Odoo: fasi, opportunità,
cliente, valore. Le opportunità si possono spostare di fase (anche "segna
vinta/persa", che è solo uno spostamento) sia dalla dashboard sia da
Telegram in linguaggio naturale. I task personali **non hanno più una board
dedicata**: restano gestibili dalla card Session di Home (i 3 più urgenti)
e da Telegram (rimozione/completamento già costruiti in precedenza) — scelta
esplicita dell'utente, non una svista.

## Cosa viene rimosso

- `components/CrmBoard.jsx` — l'intera board Kanban/Per persona per i task
  personali, sostituita da un nuovo componente per le opportunità Odoo.
- `app/api/crm/task/route.js`, `app/api/crm/task/[id]/route.js`,
  `app/api/crm/task/[id]/completa/route.js` — servivano solo a `CrmBoard`.
- `app/api/crm/riordina/route.js` — il drag&drop per riordinare i task
  dentro una fascia; Odoo non ha un campo di ordinamento manuale
  equivalente, e la funzione serviva solo a `CrmBoard`.
- `app/api/crm/cerca/route.js` — la ricerca in linguaggio naturale sui task
  personali; senza una board che la usi, non ha più un consumatore.

Non tocchiamo `lib/store.js` (`getTask`, `addTask`, `updateTask`,
`completeTask`, `deleteTask`): restano in uso dalla card Session di Home e
dalle azioni Telegram sui task (`lib/azioni.js`, già costruito).

## Architettura

```
Elyra (Vercel) --[JSON-RPC, stesso client di lib/odoo.js]--> Odoo (crm.lead, crm.stage)
```

Estende `lib/odoo.js` (stessa autenticazione/`eseguiOdoo` già presenti, nessuna
dipendenza nuova) con due funzioni:

```js
export async function leggiPipelineOdoo()
// → Promise<{
//     stages: [{ id, nome, vinta }],           // da crm.stage, ordinate per sequence
//     opportunita: [{
//       id, titolo, cliente, stageId, valore,
//       probabilita, priorita, scadenza,
//     }],                                       // da crm.lead, type="opportunity", active=true
//   }>

export async function spostaFaseOpportunita(opportunitaId, nuovoStageId)
// Scrive stage_id. Se la fase di destinazione ha vinta=true, scrive anche
// probability=100 (comportamento minimo — non replica ogni effetto
// collaterale che l'interfaccia Odoo applica trascinando una scheda lì,
// solo lo spostamento di fase e il caso ovvio "vinta = 100%").
// → Promise<{ id, titolo, cliente, stageId, valore, probabilita, priorita, scadenza }>
```

### Dati sempre in diretta — eccezione esplicita

Ogni altra scheda di Elyra legge un'istantanea salvata e si aggiorna solo al
clic (regola tenuta ferma in tutto il progetto). La pipeline CRM è
un'eccezione dichiarata: **legge Odoo in diretta a ogni apertura della
pagina** — decisione esplicita dell'utente, perché agire (spostare una
scheda) su un dato vecchio di ore rischierebbe di lavorare su
un'opportunità già cambiata nel frattempo. Nessuna istantanea salvata su
`log_giornaliero`: la CRM non passa da lì.

### Rotte

- `GET /api/crm/pipeline` → chiama `leggiPipelineOdoo()`, `Cache-Control: no-store`.
- `POST /api/crm/pipeline/[id]/fase` → body `{ stageId }`, chiama
  `spostaFaseOpportunita()`, ritorna l'opportunità aggiornata.

### Interfaccia — `components/CrmOdooBoard.jsx` (nuovo, sostituisce `CrmBoard.jsx`)

- **Kanban**: colonne = le fasi reali lette da Odoo (non più le 4 fasce
  fisse) — oggi 5, ma il numero non è hardcoded. Trascinare una scheda tra
  colonne chiama `POST /api/crm/pipeline/[id]/fase`. **Nessun riordino
  dentro una colonna** (Odoo non ha un campo equivalente a `posizione`).
- **Per cliente**: come "Per persona" di oggi, ma raggruppa per `cliente`
  (campo `partner_name` di Odoo) invece che per `persone.nome`.
- **Scheda**: titolo, cliente, valore (formattato in euro).
- **Pannello laterale** (click sulla scheda): mostra titolo, cliente,
  valore, probabilità, scadenza — tutti **di sola lettura**. L'unico campo
  modificabile è la fase (select), con un pulsante "Salva" che chiama la
  stessa rotta del drag&drop. **Nessun pulsante Elimina**: cancellare
  un'opportunità reale non è nello scope di questa integrazione.
- **Ricerca**: filtro testuale semplice lato client su titolo/cliente già
  caricati (niente rotta AI dedicata — i volumi sono piccoli e la ricerca
  NL esisteva solo per la board dei task personali, non richiesta qui).
- Nessun pulsante "aggiorna": il caricamento della pagina è già la lettura
  in diretta.

### Azioni da Telegram

Nuova funzione in `lib/azioni.js` (stesso pattern di `rilevaAzioneSuTask`,
accanto ad essa):

```js
export async function rilevaAzioneSuOpportunita(testo)
// Chiama leggiPipelineOdoo() (lettura in diretta, come la pagina), chiede
// a Claude se il messaggio è un comando di spostamento fase riferito a
// una opportunità esistente (incluso "segna vinta"/"segna persa" → fase
// con vinta=true / fase "Annullata"), con lo stesso principio di
// rilevaAzioneSuTask: se non c'è una corrispondenza sicura, azione: null
// e il testo prosegue come cattura normale.
// → Promise<{ opportunitaId: string|null, stageId: string|null, titolo: string|null }>
```

Nel webhook (`app/api/telegram/webhook/route.js`), tra il controllo
`rilevaAzioneSuTask` (esistente) e la cattura:

```
1. eDomanda?                        → risponde (invariato)
2. rilevaAzioneSuTask?               → agisce sul task (invariato)
3. rilevaAzioneSuOpportunita?        → agisce sull'opportunità, risponde
     "Spostata: '<titolo>' → <nome fase>"
4. altrimenti                        → cattura (invariato)
```

Messaggi diversi ("task" vs "opportunità") rendono la sovrapposizione tra i
due rilevatori improbabile in pratica; ognuno resta scoped al proprio
dominio (task Supabase vs opportunità Odoo) e non si controllano a vicenda.

## Cosa NON cambia

- `app/(dashboard)/page.js` (Home, card Session con i 3 task) — invariata.
- `lib/store.js`, la tabella `task` — invariati, restano in uso.
- `lib/finanze.js`, `lib/odoo.js`'s funzioni finanziarie esistenti —
  invariate.
- Nessuna nuova dipendenza npm.

## Fuori scope (non in questa iterazione)

- Modificare titolo, valore, cliente o altri campi dell'opportunità (solo
  la fase è scrivibile).
- Creare nuove opportunità da Elyra o da Telegram.
- Eliminare opportunità.
- Sincronizzare `persone`/`res.partner` tra i due sistemi.
- Una board dedicata ai task personali (scelta esplicita: restano solo in
  Home/Telegram).
