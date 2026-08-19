# Account email + password + 2FA (sostituisce la password unica)

## Contesto

Oggi l'accesso a Elyra è protetto da un'unica password (`DASHBOARD_PASSWORD`),
confrontata a tempo costante nella rotta `app/api/auth/login/route.js`, con
una sessione firmata HMAC (`lib/auth.js`, Web Crypto — deve girare
sull'Edge runtime perché `proxy.js` la usa come cancello su ogni richiesta).
Nessun account, nessuna email, nessun secondo fattore.

L'utente vuole sostituirla con un vero account (email + password) più
un'autenticazione a due fattori con Google Authenticator (TOTP, RFC 6238),
con QR code per la configurazione. Restando l'unico utente possibile di
questo sistema, non serve una pagina di registrazione pubblica: l'account
viene creato una sola volta direttamente nel database.

## Obiettivo

Login con email + password + codice a 6 cifre (tutti sulla stessa
schermata, un solo invio). Il codice diventa obbligatorio solo dopo che
il 2FA è stato configurato ed è confermato funzionante — prima di allora
basta email + password, per evitare l'uovo-e-gallina di dover inserire un
codice prima ancora di aver configurato il generatore di codici. La
configurazione del 2FA avviene da dentro l'app (`/impostazioni`), non da
una pagina pubblica.

## Scelte già confermate con l'utente

- **Nessun recupero password via email** — nessuna infrastruttura di invio
  email, nessuna pagina "password dimenticata" (un classico punto debole).
  Se serve, la password si reimposta direttamente nel database.
- **QR code per il 2FA** (non inserimento manuale) — richiede una
  dipendenza npm nuova (`qrcode`), unica eccezione alla regola generale
  del progetto di non aggiungere dipendenze quando si può fare a meno:
  generare un QR leggibile senza libreria non è praticabile come lo è
  stato firmare un JWT o implementare TOTP a mano.
- **Login in un solo passaggio** (email + password + codice sulla stessa
  schermata, non un flusso a più schermate).
- **Nessuna pagina di registrazione pubblica** — l'unico account esiste
  già, creato una volta sola.

## Architettura

### Nuova tabella `account_auth` (non dentro `profilo`)

Le credenziali restano separate dalla tabella `profilo` (nome, abitudini,
focus del giorno, ecc.) apposta: `profilo` viene letta per intero in più
punti del codice (Home, `/api/riepilogo`, il briefing), e tenere lì dentro
anche l'hash della password o il segreto TOTP aumenterebbe il rischio che
finiscano per sbaglio in una risposta HTTP o in un prompt per il modello.
Una riga sola, come `profilo`:

```sql
create table account_auth (
  id integer primary key default 1,
  email text not null,
  password_hash text not null,        -- formato "<salt-hex>:<hash-hex>"
  totp_secret text,                    -- base32, null finché non configurato
  totp_abilitato boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint account_auth_singola_riga check (id = 1)
);
alter table account_auth enable row level security;
-- stessa riga di sicurezza delle altre tabelle: nessuna policy, solo la
-- chiave di servizio (che gira sul server, dentro lib/store.js) la vede.
```

### `lib/password.js` (nuovo, server-only, `crypto` nativo di Node)

```js
export function hashPassword(password) → string   // "<salt>:<hash>"
export function verifyPassword(password, stored) → boolean
```

`scryptSync` + confronto a tempo costante (`crypto.timingSafeEqual`).
Questo modulo NON gira mai nell'Edge runtime di `proxy.js` — solo nelle
rotte `app/api/auth/*`, che sono normali route handler Node.

### `lib/totp.js` (nuovo, server-only, `crypto` nativo di Node)

```js
export function generaSegreto() → string                    // base32, 160 bit
export function generaOtpauthUri(secret, email) → string    // per il QR
export function verificaCodice(secret, codice) → boolean    // finestra ±30s
```

Implementazione diretta di RFC 6238 (TOTP) su RFC 4226 (HOTP) — HMAC-SHA1,
6 cifre, intervallo di 30 secondi, tolleranza di un intervallo prima/dopo
per la differenza di orologio tra telefono e server. Stesso spirito di
`lib/googleCalendar.js`: protocollo implementato a mano con `crypto`
nativo, nessuna libreria per la logica TOTP (solo per il QR, vedi sotto).

### QR code — dipendenza `qrcode`

`QRCode.toDataURL(otpauthUri)` lato server, restituisce un'immagine PNG
come data URI da mettere in un tag `<img>` — nessun endpoint nuovo per
servire immagini, nessuno stato lato client oltre a quella stringa.

### Login — `app/api/auth/login/route.js` (riscritta)

```
POST { email, password, codice }
  1. legge la riga account_auth
  2. email non combacia (confronto a tempo costante) → 401 "Credenziali non valide"
  3. password non combacia → 401 "Credenziali non valide" (stesso messaggio
     del punto 2 — non si rivela quale dei due era sbagliato)
  4. se totp_abilitato: codice mancante o non valido → 401 "Codice non valido"
  5. tutto ok → stesso createSessionCookieValue/cookie di oggi, invariato
```

`app/login/page.js` guadagna i campi Email e Codice (2FA) accanto a
Password, tutti sempre visibili — il backend ignora `codice` se
`totp_abilitato` è ancora `false`, quindi non serve che la pagina sappia
in anticipo se il 2FA è già configurato.

### Configurazione del 2FA — dentro `/impostazioni`

Nuova sezione "Sicurezza" nella pagina impostazioni esistente (stesso
pattern a blocchi separati da `<hr className="rule" />` già usato per
Backup/Sessione). Due rotte nuove:

- `POST /api/auth/totp/inizia` → genera un segreto nuovo con
  `generaSegreto()`, lo salva in `account_auth.totp_secret` (ma
  `totp_abilitato` resta `false` finché non è confermato), ritorna
  `{ segreto, qrDataUri }` (via `generaOtpauthUri` + `QRCode.toDataURL`).
- `POST /api/auth/totp/conferma` con `{ codice }` → verifica il codice
  contro il segreto appena salvato; se corretto, imposta
  `totp_abilitato = true`; se sbagliato, non cambia nulla (l'utente può
  riprovare o rigenerare da capo con `/inizia`).
- `POST /api/auth/totp/disabilita` con `{ password }` → richiede la
  password corrente per conferma, poi azzera `totp_secret` e
  `totp_abilitato` (per il caso "ho perso il telefono").

La sezione "Sicurezza" mostra lo stato attuale (2FA attivo/non attivo) e
il pulsante giusto per lo stato (Configura / Disabilita).

## Migrazione dalla password unica

1. L'utente sceglie email e password nuove, me le dà.
2. Creo la riga `account_auth` direttamente su Supabase (email +
   `hashPassword(password)`), `totp_abilitato: false` — nessun modulo
   pubblico di registrazione, un'unica azione manuale.
3. Prova il login con email + password (senza 2FA ancora).
4. Da `/impostazioni` → Sicurezza, configura il 2FA (scansiona il QR,
   conferma con il primo codice).
5. Da questo punto ogni login richiede anche il codice.
6. `DASHBOARD_PASSWORD` viene rimossa da `.env.local` e da Vercel — non è
   più usata da nessuna parte del codice.

## Cosa NON cambia

- `proxy.js` — il cancello su ogni richiesta resta identico: controlla lo
  stesso cookie di sessione firmato HMAC, non tocca mai password o TOTP
  direttamente (continua a girare sull'Edge runtime).
- `lib/auth.js` — `createSessionCookieValue`/`verifySessionCookieValue`/
  `constantTimeEqual` restano gli stessi, riusati identici dalla nuova
  rotta di login.
- `API_SECRET` (per Telegram, cron, chiamate da script) — invariato,
  meccanismo separato dal login utente.
- La sessione dura ancora 30 giorni una volta autenticati.

## Fuori scope (non in questa iterazione)

- Recupero password via email.
- Più di un account/utente.
- Codici di backup per il 2FA (se perdi il telefono E non ricordi la
  password, serve intervento diretto sul database — accettabile per un
  solo utente).
- Notifiche di accesso, log dei tentativi falliti.
