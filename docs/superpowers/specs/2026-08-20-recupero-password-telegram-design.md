# Recupero password via Telegram

## Contesto

Da [2026-08-19-account-email-2fa-design.md](2026-08-19-account-email-2fa-design.md)
l'accesso a Elyra richiede email + password + (obbligatoriamente, ormai)
codice 2FA. Quello spec escludeva esplicitamente il recupero password via
email ("Fuori scope... se serve, la password si reimposta direttamente
nel database"). Durante l'implementazione l'utente ha chiesto di
aggiungere comunque un pulsante e un processo di recupero, a patto che
passi dal bot Telegram già esistente (`TELEGRAM_BOT_TOKEN`,
`TELEGRAM_USER_ID`) e non da un'infrastruttura email nuova.

Restando l'app a singolo utente, il bot Telegram è già il canale
attendibile usato per il briefing giornaliero e la cattura di
appunti/eventi — riusarlo per il recupero password evita di introdurre
un secondo canale (email) con tutto il suo contorno (provider, template,
verifica di consegna).

## Obiettivo

Un pulsante "Password dimenticata?" nella pagina di login che, cliccato,
manda un link di reset sul Telegram dell'utente. Il link porta a una
pagina dove si sceglie una nuova password. Il 2FA (se attivo) non viene
toccato dal processo — resta comunque richiesto al login successivo,
esattamente come oggi.

## Scelte già confermate con l'utente

- **Link con token** (non un codice da ricopiare a mano) — il bot manda
  un URL diretto `/login/reimposta?token=...`.
- **Scadenza 15 minuti** dall'invio.
- **Limite di 1 richiesta al minuto** — se si clicca il pulsante più
  volte entro 60 secondi dall'ultimo invio riuscito, non parte un nuovo
  messaggio Telegram (il precedente è ancora valido); la risposta
  all'utente resta comunque "ok" in entrambi i casi.
- **Il recupero password non tocca il 2FA** — resta fuori scope il caso
  "ho perso anche il telefono", per cui serve intervento diretto sul
  database (stessa decisione già presa per i codici di backup TOTP).

## Architettura

### Migrazione — nuove colonne su `account_auth`

Niente tabella nuova: `account_auth` è già una riga sola per definizione
(vedi `account_auth_singola_riga`), stesso spirito delle colonne
`totp_secret`/`totp_abilitato` aggiunte in precedenza.

```sql
alter table account_auth
  add column reset_token_hash text,
  add column reset_token_scade timestamptz,
  add column reset_richiesto_il timestamptz;
```

Tutte e tre nullable, `null` quando non c'è nessuna richiesta di reset
in corso.

Il token stesso **non** viene mai salvato in chiaro: solo il suo hash
SHA-256. A differenza di `totp_secret` (che deve restare leggibile per
essere ri-verificato ad ogni codice), il token di reset serve solo per
un confronto una tantum — quindi si applica lo stesso principio già
seguito per `password_hash`: mai un segreto riusabile in chiaro a
riposo nel database.

### `lib/store.js` — nessuna funzione nuova

`getAccountAuth()`/`updateAccountAuth(patch)` esistono già e coprono
anche queste tre colonne senza modifiche, dato che leggono/scrivono
l'intera riga per campi.

### `POST /api/auth/richiedi-reset` (nuova rotta, pubblica)

Pubblica di necessità (va usata proprio quando non si riesce ad
accedere) — rientra nel prefisso `/api/auth/` già esente in
`proxy.js`, che qui è corretto (a differenza delle rotte TOTP, che
erano state spostate perché *non* dovevano essere pubbliche). Nessuna
modifica a `proxy.js`.

```
POST /api/auth/richiedi-reset   (nessun corpo)
  1. legge account_auth
  2. se reset_richiesto_il esiste ed è passato meno di 60s da adesso:
     risponde { ok: true } senza generare un nuovo token né mandare
     un messaggio Telegram (il link precedente è ancora valido)
  3. altrimenti:
     a. genera un token casuale (32 byte, crypto.randomBytes, hex)
     b. calcola l'hash sha256 del token (crypto.createHash)
     c. aggiorna account_auth: reset_token_hash = hash,
        reset_token_scade = now + 15 minuti, reset_richiesto_il = now
     d. manda un messaggio Telegram (stesso pattern fetch già usato in
        lib/briefing.js — POST a
        https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage,
        chat_id: TELEGRAM_USER_ID) con il link
        https://<host>/login/reimposta?token=<token-in-chiaro>
        (host dedotto dall'header Host della richiesta, coerente con
        come l'app già costruisce URL assoluti altrove)
  4. risponde sempre { ok: true } — nessuna informazione su cosa sia
     successo esattamente, stesso principio del login (niente
     enumerazione, anche se qui l'account è comunque unico e noto)
```

Se l'invio Telegram fallisce (rete, token bot invalido), la rotta logga
l'errore server-side ma risponde comunque `{ ok: true }` — un
fallimento di consegna non deve rivelare stato interno a chi chiama, e
l'utente può semplicemente ricliccare il pulsante passato il minuto di
attesa.

### `POST /api/auth/reimposta-password` (nuova rotta, pubblica)

```
POST /api/auth/reimposta-password { token, password }
  1. legge account_auth
  2. se manca reset_token_hash, o reset_token_scade è passata, o
     l'hash sha256(token) non combacia con reset_token_hash (confronto
     a tempo costante, crypto.timingSafeEqual) →
     401 { ok: false, error: "Link non valido o scaduto." }
  3. se password è vuota o troppo corta (minimo 8 caratteri, stesso
     buon senso già implicito nella password originale) →
     400 { ok: false, error: "Password troppo corta." }
  4. altrimenti:
     a. password_hash = hashPassword(password)  (lib/password.js,
        già esistente, riusata identica)
     b. account_auth aggiornata: password_hash = nuovo hash,
        reset_token_hash = null, reset_token_scade = null,
        reset_richiesto_il = null (token monouso, invalidato subito
        dopo l'uso)
     c. totp_secret / totp_abilitato NON vengono toccati
     d. risponde { ok: true }
```

### `/login/reimposta` (nuova pagina, pubblica)

Rientra nel prefisso `/login` già esente in `proxy.js` — nessuna
modifica lì. Componente client, stesso stile visivo della pagina di
login esistente (stessa `card`, stessi campi stile `campoStile`).

- Legge `token` dalla query string (`useSearchParams`).
- Form con due campi: nuova password + conferma (verifica lato client
  che combacino prima di inviare, oltre al controllo lato server).
- `POST /api/auth/reimposta-password { token, password }`.
- Successo → messaggio "Password aggiornata." con link a `/login`
  (nessun redirect automatico, l'utente rientra da sé con le nuove
  credenziali + 2FA se attivo).
- Se `token` manca dalla query string, mostra subito "Link non valido."
  senza nemmeno mostrare il form.

### `app/login/page.js` — pulsante nuovo

Sotto il pulsante "Entra", un secondo pulsante testuale/link-style
"Password dimenticata?" che:
- alla pressione, chiama `POST /api/auth/richiedi-reset`
- mostra "Controlla Telegram." al posto del pulsante stesso (nessun
  redirect, l'utente resta sulla pagina di login)
- non richiede altri campi (email/password) — dato l'unico account,
  non serve chiedere quale account recuperare

Colto di passaggio (stesso file, tocco cosmetico segnalato dalla
review finale del piano 2FA): l'etichetta del campo codice passa da
"Codice (se hai attivato il 2FA)" a "Codice 2FA" — il 2FA è ormai
obbligatorio, non più condizionale.

## Cosa NON cambia

- `proxy.js` — nessuna modifica, le due nuove rotte pubbliche rientrano
  già nei prefissi esenti esistenti (`/api/auth/`, `/login`).
- `lib/auth.js` — invariato, il recupero password non emette né
  invalida sessioni.
- Il 2FA (`totp_secret`, `totp_abilitato`) — invariato dal processo di
  reset password. Se attivo, resta obbligatorio al login successivo.
- `lib/password.js`, `lib/totp.js` — riusati identici, nessuna
  modifica.

## Fuori scope (non in questa iterazione)

- Recupero nel caso si sia perso *anche* l'accesso a Telegram (unico
  canale, se non raggiungibile serve intervento diretto sul database
  — stessa logica già accettata per il 2FA senza codici di backup).
- Notifiche di richieste di reset "sospette" o log dei tentativi.
- Multi-account/multi-utente (resta un'app a singolo utente).
