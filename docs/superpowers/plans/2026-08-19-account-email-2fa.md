# Account email + password + 2FA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la password unica (`DASHBOARD_PASSWORD`) con un vero account (email + password) più un'autenticazione a due fattori TOTP (Google Authenticator, QR code), configurabile da `/impostazioni`.

**Architecture:** Una nuova tabella `account_auth` (riga singola, separata da `profilo`) tiene email, hash della password (scrypt nativo di Node) e segreto TOTP. `lib/password.js` e `lib/totp.js` implementano hashing e TOTP (RFC 6238) a mano con `crypto` nativo — nessuna libreria, stesso spirito di `lib/odoo.js`/`lib/googleCalendar.js`. L'unica dipendenza nuova è `qrcode`, per disegnare il QR di configurazione. `proxy.js` e `lib/auth.js` (il cancello a ogni richiesta, sessione firmata HMAC) restano identici: cambia solo come si verificano le credenziali prima di rilasciare il cookie.

**Tech Stack:** Next.js 16 (App Router, JavaScript), `crypto` nativo di Node (scrypt, HMAC-SHA1), `qrcode` (nuova dipendenza, unica eccezione alla regola "nessuna libreria nuova").

## Global Constraints

- `proxy.js` (Edge runtime) non cambia — continua a verificare solo il cookie di sessione via `lib/auth.js` (Web Crypto), mai password o TOTP direttamente.
- `lib/password.js` e `lib/totp.js` girano SOLO in route handler Node normali (`app/api/auth/*`), mai nell'Edge runtime.
- Le credenziali (`account_auth`) restano in una tabella separata da `profilo` — mai lette/scritte tramite `getProfilo()`/`updateProfilo()`.
- Nessun accesso diretto a Supabase fuori da `lib/store.js`.
- Nessuna pagina di registrazione pubblica — l'account si crea una volta sola, manualmente.
- Login in un solo passaggio: email + password + codice sulla stessa schermata.
- Il codice (2FA) è obbligatorio solo quando `account_auth.totp_abilitato` è `true`.
- Nessun recupero password via email.
- JavaScript, non TypeScript.
- Nessun framework di test automatico — verifica via `curl`/browser contro il server dev locale, che condivide lo stesso Supabase della produzione.

---

### Task 1: `lib/password.js` — hashing della password

**Files:**
- Create: `lib/password.js`
- Create (temporaneo, rimosso a fine task): `app/api/debug-password/route.js`

**Interfaces:**
- Produces: `export function hashPassword(password)` → `string` (formato `"<salt-hex>:<hash-hex>"`)
- Produces: `export function verifyPassword(password, stored)` → `boolean`

- [ ] **Step 1: Scrivere `lib/password.js`**

```js
import "server-only";
import crypto from "crypto";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const candidateBuffer = crypto.scryptSync(password, salt, 64);
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}
```

- [ ] **Step 2: Rotta di debug temporanea**

```js
import { hashPassword, verifyPassword } from "@/lib/password";

export async function POST(request) {
  const { password } = await request.json();
  const stored = hashPassword(password);
  const correttaOk = verifyPassword(password, stored);
  const sbagliataOk = verifyPassword(password + "x", stored);
  return Response.json({ stored, correttaOk, sbagliataOk });
}
```

- [ ] **Step 3: Verificare**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"password": "provaProva123!"}' http://localhost:3000/api/debug-password
```

Expected: `stored` nel formato `"<64 caratteri hex>:<128 caratteri hex>"`, `correttaOk: true`, `sbagliataOk: false`. Richiama la rotta una seconda volta con la stessa password: `stored` deve essere DIVERSO dalla prima volta (il salt cambia ogni volta), ma `correttaOk` sempre `true` per la password giusta.

- [ ] **Step 4: Rimuovere la rotta di debug**

```bash
rm -rf "C:/000_Cowork_Claude/Elyra_Memoria/app/api/debug-password"
```

- [ ] **Step 5: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/password.js
git commit -m "Aggiunge lib/password.js — hashing password con scrypt nativo"
```

---

### Task 2: `lib/totp.js` — TOTP a mano (RFC 6238)

**Files:**
- Create: `lib/totp.js`
- Modify: `package.json` (nuova dipendenza `qrcode`)
- Create (temporaneo, rimosso a fine task): `app/api/debug-totp/route.js`

**Interfaces:**
- Produces: `export function generaSegreto()` → `string` (base32, 160 bit)
- Produces: `export function generaOtpauthUri(secret, email)` → `string`
- Produces: `export function verificaCodice(secret, codice)` → `boolean`

- [ ] **Step 1: Installare `qrcode`**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
npm install qrcode
```

- [ ] **Step 2: Scrivere `lib/totp.js`**

```js
import "server-only";
import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return output;
}

function base32Decode(str) {
  let bits = "";
  for (const char of str.toUpperCase().replace(/=+$/, "")) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Segreto TOTP: 160 bit (20 byte), la dimensione raccomandata da RFC 4226
// per HMAC-SHA1 — coincide con quanto si aspettano le app di autenticazione
// reali come Google Authenticator.
export function generaSegreto() {
  return base32Encode(crypto.randomBytes(20));
}

// RFC 4226 (HOTP): HMAC-SHA1 sul contatore, troncamento dinamico, 6 cifre.
function generaCodice(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codice =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(codice % 1000000).padStart(6, "0");
}

// RFC 6238 (TOTP): il contatore HOTP è il numero di intervalli da 30
// secondi passati dall'epoca. Tolleranza di ±1 intervallo per la
// differenza di orologio tra telefono e server.
export function verificaCodice(secret, codice) {
  if (!codice) return false;
  const counterAttuale = Math.floor(Date.now() / 1000 / 30);
  for (let delta = -1; delta <= 1; delta++) {
    if (generaCodice(secret, counterAttuale + delta) === codice) return true;
  }
  return false;
}

export function generaOtpauthUri(secret, email) {
  const label = encodeURIComponent(`Elyra:${email}`);
  const issuer = encodeURIComponent("Elyra Memoria");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
```

- [ ] **Step 3: Rotta di debug temporanea (verifica algoritmica, senza telefono)**

```js
import { generaSegreto, generaOtpauthUri, verificaCodice } from "@/lib/totp";

export async function GET() {
  const segreto = generaSegreto();
  const uri = generaOtpauthUri(segreto, "prova@esempio.it");

  // Genera il codice valido ORA usando la stessa funzione interna che
  // verificaCodice usa per confrontare — è un test di autocoerenza, non
  // prova che un'app reale produca lo stesso codice (quello si verifica
  // nel Task 4, con un telefono vero).
  const modulo = await import("@/lib/totp");
  const controllo = modulo.verificaCodice(segreto, "000000");

  return Response.json({
    segreto,
    lunghezzaSegreto: segreto.length,
    uri,
    codiceSbagliatoRifiutato: controllo === false,
  });
}
```

- [ ] **Step 4: Verificare l'autocoerenza**

```bash
API_SECRET=$(grep "^API_SECRET=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -H "x-api-secret: $API_SECRET" http://localhost:3000/api/debug-totp
```

Expected: `segreto` di 32 caratteri (160 bit in base32), `uri` che inizia con `otpauth://totp/Elyra%3Aprova%40esempio.it?secret=...`, `codiceSbagliatoRifiutato: true` (un codice fisso "000000" quasi certamente non è quello vero in quel preciso istante).

- [ ] **Step 5: Rimuovere la rotta di debug**

```bash
rm -rf "C:/000_Cowork_Claude/Elyra_Memoria/app/api/debug-totp"
```

- [ ] **Step 6: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add lib/totp.js package.json package-lock.json
git commit -m "Aggiunge lib/totp.js — TOTP RFC 6238 a mano, con crypto nativo"
```

---

### Task 3: Tabella `account_auth`, creazione dell'account, nuovo login

**Files:**
- Create: `supabase/migrations/0003_account_auth.sql`
- Modify: `lib/store.js` (aggiunge `getAccountAuth`/`updateAccountAuth`)
- Modify: `app/api/auth/login/route.js` (riscritta)
- Modify: `app/login/page.js` (aggiunge i campi Email e Codice)

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword` da `lib/password.js` (Task 1); `verificaCodice` da `lib/totp.js` (Task 2)
- Produces: `export async function getAccountAuth()` → `Promise<{id, email, password_hash, totp_secret, totp_abilitato, updated_at} | null>` (usata dai Task 4)
- Produces: `export async function updateAccountAuth(patch)` → `Promise<{...stessa forma...}>` (usata dai Task 4)

- [ ] **Step 1: Migrazione**

Crea `supabase/migrations/0003_account_auth.sql`:

```sql
-- Account per l'accesso a Elyra: email + password + 2FA. Riga singola,
-- separata da `profilo` apposta — `profilo` viene letta per intero in più
-- punti del codice, e tenere lì dentro segreti aumenterebbe il rischio che
-- finiscano per sbaglio in una risposta HTTP o in un prompt per il modello.
create table if not exists account_auth (
  id integer primary key default 1,
  email text not null,
  password_hash text not null,
  totp_secret text,
  totp_abilitato boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint account_auth_singola_riga check (id = 1)
);

alter table account_auth enable row level security;
-- Nessuna policy: solo la chiave di servizio (lato server, dentro
-- lib/store.js) vede questa tabella — stessa riga di sicurezza delle altre.
```

Chiedi all'utente di eseguirla nell'SQL Editor di Supabase.

- [ ] **Step 2: Raccogliere email e password dall'utente**

Chiedi all'utente l'email e la password che vuole usare per accedere a Elyra d'ora in poi (sostituiscono `DASHBOARD_PASSWORD`). Non generarle tu: deve essere una password che l'utente sceglie e ricorda.

- [ ] **Step 3: Aggiungere `getAccountAuth`/`updateAccountAuth` a `lib/store.js`**

Aggiungi vicino alle funzioni di `profilo` (stesso file, stesso stile):

```js
// ---------------------------------------------------------------
// Account auth — riga singola, MAI auto-seedata come profilo: un hash
// vuoto sarebbe un buco di sicurezza. Si crea una volta sola a mano.
// ---------------------------------------------------------------

export async function getAccountAuth() {
  const { data, error } = await supabase
    .from("account_auth")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  orThrow(error, "getAccountAuth");
  return data;
}

export async function updateAccountAuth(patch) {
  const { data, error } = await supabase
    .from("account_auth")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("*")
    .single();
  orThrow(error, "updateAccountAuth");
  return data;
}
```

- [ ] **Step 4: Creare la riga `account_auth` reale**

Usando l'email e la password raccolte allo Step 2, calcola l'hash e inserisci la riga direttamente su Supabase:

```bash
node -e "
const crypto = require('crypto');
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(process.argv[1], salt, 64).toString('hex');
console.log(salt + ':' + hash);
" "<LA_PASSWORD_DELL_UTENTE>"
```

```bash
SUPA_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
SUPA_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" "/c/000_Cowork_Claude/Elyra_Memoria/.env.local" | cut -d= -f2-)
curl -s -X POST "$SUPA_URL/rest/v1/account_auth" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"id\": 1, \"email\": \"<EMAIL_DELL_UTENTE>\", \"password_hash\": \"<HASH_DALLO_STEP_PRECEDENTE>\"}"
```

Expected: la risposta mostra la riga creata, con `totp_abilitato: false`.

- [ ] **Step 5: Riscrivere `app/api/auth/login/route.js`**

```js
import { cookies } from "next/headers";
import {
  constantTimeEqual,
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { getAccountAuth } from "@/lib/store";
import { verifyPassword } from "@/lib/password";
import { verificaCodice } from "@/lib/totp";

export async function POST(request) {
  const { email, password, codice } = await request.json().catch(() => ({}));

  const account = await getAccountAuth();
  if (!account) {
    return Response.json({ ok: false, error: "Credenziali non valide." }, { status: 401 });
  }

  const emailValida = constantTimeEqual(
    (email ?? "").toLowerCase(),
    account.email.toLowerCase()
  );
  const passwordValida = emailValida && verifyPassword(password ?? "", account.password_hash);
  if (!passwordValida) {
    return Response.json({ ok: false, error: "Credenziali non valide." }, { status: 401 });
  }

  if (account.totp_abilitato && !verificaCodice(account.totp_secret, codice ?? "")) {
    return Response.json({ ok: false, error: "Codice non valido." }, { status: 401 });
  }

  const value = await createSessionCookieValue(process.env.AUTH_SECRET);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return Response.json({ ok: true });
}
```

- [ ] **Step 6: Aggiungere i campi Email e Codice a `app/login/page.js`**

Sostituisci l'intero contenuto con:

```jsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codice, setCodice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, codice }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || "Credenziali non valide.");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Qualcosa è andato storto. Riprova.");
      setLoading(false);
    }
  }

  const campoStile = {
    background: "var(--ink-850)",
    border: "1px solid var(--line-soft)",
    borderRadius: 7,
    padding: "10px 12px",
    color: "var(--paper)",
    fontFamily: "var(--font-body)",
    fontSize: 14,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ width: "100%", maxWidth: 360 }}
      >
        <div className="card-plate">
          <span className="plate-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.4" />
              <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
            </svg>
            Elyra — accesso
          </span>
        </div>
        <div className="card-body" style={{ gap: 10 }}>
          <div>
            <label htmlFor="email" style={{ fontSize: 12.5, color: "var(--paper-dim)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...campoStile, width: "100%", marginTop: 4 }}
            />
          </div>
          <div>
            <label htmlFor="password" style={{ fontSize: 12.5, color: "var(--paper-dim)" }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...campoStile, width: "100%", marginTop: 4 }}
            />
          </div>
          <div>
            <label htmlFor="codice" style={{ fontSize: 12.5, color: "var(--paper-dim)" }}>
              Codice (se hai attivato il 2FA)
            </label>
            <input
              id="codice"
              type="text"
              inputMode="numeric"
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
              style={{ ...campoStile, width: "100%", marginTop: 4 }}
            />
          </div>
          {error && (
            <div style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-refresh"
            style={{
              justifyContent: "center",
              padding: "10px 12px",
              fontSize: 13,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Verifica…" : "Entra"}
          </button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Verificare localmente**

Riavvia il server dev. Prova prima con la password sbagliata dalla pagina `/login` nel browser: expected, "Credenziali non valide.". Poi con email e password corrette (lascia il campo Codice vuoto, dato che `totp_abilitato` è ancora `false`): expected, accesso riuscito, redirect alla Home.

- [ ] **Step 8: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add supabase/migrations/0003_account_auth.sql lib/store.js "app/api/auth/login/route.js" "app/login/page.js"
git commit -m "Account email+password: tabella account_auth, nuovo login"
```

---

### Task 4: Configurazione del 2FA da `/impostazioni`

**Files:**
- Create: `app/api/account/totp/route.js` (stato)
- Create: `app/api/account/totp/inizia/route.js`
- Create: `app/api/account/totp/conferma/route.js`
- Create: `app/api/account/totp/disabilita/route.js`
- Create: `components/SicurezzaTotp.jsx`
- Modify: `app/(dashboard)/impostazioni/page.js`

**Interfaces:**
- Consumes: `getAccountAuth`/`updateAccountAuth` da `lib/store.js` (Task 3); `generaSegreto`/`generaOtpauthUri`/`verificaCodice` da `lib/totp.js` (Task 2); `verifyPassword` da `lib/password.js` (Task 1)

- [ ] **Step 1: `app/api/account/totp/route.js` (stato attuale)**

```js
import { getAccountAuth } from "@/lib/store";

export async function GET() {
  const account = await getAccountAuth();
  return Response.json({ totpAbilitato: account?.totp_abilitato ?? false });
}
```

- [ ] **Step 2: `app/api/account/totp/inizia/route.js`**

```js
import QRCode from "qrcode";
import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { generaSegreto, generaOtpauthUri } from "@/lib/totp";

export async function POST() {
  const account = await getAccountAuth();
  if (!account) {
    return Response.json({ error: "Nessun account configurato." }, { status: 400 });
  }
  const segreto = generaSegreto();
  await updateAccountAuth({ totp_secret: segreto, totp_abilitato: false });
  const uri = generaOtpauthUri(segreto, account.email);
  const qrDataUri = await QRCode.toDataURL(uri);
  return Response.json({ segreto, qrDataUri });
}
```

- [ ] **Step 3: `app/api/account/totp/conferma/route.js`**

```js
import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { verificaCodice } from "@/lib/totp";

export async function POST(request) {
  const { codice } = await request.json().catch(() => ({}));
  const account = await getAccountAuth();
  if (!account?.totp_secret) {
    return Response.json({ ok: false, error: "Nessuna configurazione in corso." }, { status: 400 });
  }
  if (!verificaCodice(account.totp_secret, codice ?? "")) {
    return Response.json({ ok: false, error: "Codice non valido." }, { status: 401 });
  }
  await updateAccountAuth({ totp_abilitato: true });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: `app/api/account/totp/disabilita/route.js`**

```js
import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { verifyPassword } from "@/lib/password";

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  const account = await getAccountAuth();
  if (!account || !verifyPassword(password ?? "", account.password_hash)) {
    return Response.json({ ok: false, error: "Password errata." }, { status: 401 });
  }
  await updateAccountAuth({ totp_secret: null, totp_abilitato: false });
  return Response.json({ ok: true });
}
```

- [ ] **Step 5: `components/SicurezzaTotp.jsx`**

```jsx
"use client";

import { useEffect, useState } from "react";

export default function SicurezzaTotp() {
  const [abilitato, setAbilitato] = useState(null);
  const [configurazione, setConfigurazione] = useState(null);
  const [codice, setCodice] = useState("");
  const [passwordDisabilita, setPasswordDisabilita] = useState("");
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");

  useEffect(() => {
    fetch("/api/account/totp")
      .then((res) => res.json())
      .then((body) => setAbilitato(body.totpAbilitato));
  }, []);

  async function iniziaConfigurazione() {
    setErrore("");
    setMessaggio("");
    const res = await fetch("/api/account/totp/inizia", { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setErrore(body.error || "Errore, riprova.");
      return;
    }
    setConfigurazione(body);
  }

  async function confermaConfigurazione(e) {
    e.preventDefault();
    setErrore("");
    const res = await fetch("/api/account/totp/conferma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codice }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      setErrore(body.error || "Codice non valido.");
      return;
    }
    setAbilitato(true);
    setConfigurazione(null);
    setCodice("");
    setMessaggio("Autenticazione a due fattori attivata.");
  }

  async function disabilita(e) {
    e.preventDefault();
    setErrore("");
    const res = await fetch("/api/account/totp/disabilita", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordDisabilita }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      setErrore(body.error || "Password errata.");
      return;
    }
    setAbilitato(false);
    setPasswordDisabilita("");
    setMessaggio("Autenticazione a due fattori disattivata.");
  }

  if (abilitato === null) return null;

  const campoStile = {
    background: "var(--ink-850)",
    border: "1px solid var(--line-soft)",
    borderRadius: 7,
    padding: "9px 11px",
    color: "var(--paper)",
    fontSize: 13,
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        Autenticazione a due fattori
      </div>
      <div style={{ fontSize: 12.5, color: "var(--paper-dim)", marginBottom: 10 }}>
        {abilitato
          ? "Attiva — ogni accesso richiede anche il codice da Google Authenticator."
          : "Non attiva — configurala per proteggere l'accesso con un secondo codice."}
      </div>

      {errore && <div style={{ color: "var(--bad)", fontSize: 12.5, marginBottom: 8 }}>{errore}</div>}
      {messaggio && <div style={{ color: "var(--good)", fontSize: 12.5, marginBottom: 8 }}>{messaggio}</div>}

      {abilitato && !configurazione && (
        <form onSubmit={disabilita} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
          <input
            type="password"
            placeholder="Password attuale"
            value={passwordDisabilita}
            onChange={(e) => setPasswordDisabilita(e.target.value)}
            style={campoStile}
          />
          <button type="submit" className="btn-refresh btn-danger" style={{ justifyContent: "center" }}>
            Disabilita
          </button>
        </form>
      )}

      {!abilitato && !configurazione && (
        <button type="button" className="btn-refresh btn-primary" onClick={iniziaConfigurazione}>
          Configura
        </button>
      )}

      {configurazione && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
          <img
            src={configurazione.qrDataUri}
            alt="QR per Google Authenticator"
            style={{ width: 200, height: 200 }}
          />
          <div style={{ fontSize: 11, color: "var(--paper-faint)" }}>
            Non riesci a scansionare? Inserisci a mano: <span className="num">{configurazione.segreto}</span>
          </div>
          <form onSubmit={confermaConfigurazione} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Codice a 6 cifre"
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
              style={campoStile}
            />
            <button type="submit" className="btn-refresh btn-primary" style={{ justifyContent: "center" }}>
              Conferma
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Collegare `SicurezzaTotp` in `app/(dashboard)/impostazioni/page.js`**

Aggiungi l'import in cima al file:

```js
import SicurezzaTotp from "@/components/SicurezzaTotp";
```

E aggiungi una nuova sezione dentro `card-body`, dopo il blocco "Sessione" (con lo stesso separatore `<hr className="rule" />` già usato tra Backup e Sessione):

```jsx
<hr className="rule" />
<SicurezzaTotp />
```

- [ ] **Step 7: Verifica ALGORITMICA in locale (senza telefono)**

Avvia il server dev, fai login (Task 3), vai su `/impostazioni`. Clicca "Configura": expected, appare un'immagine QR e il codice segreto in testo. Prova a confermare con un codice palesemente sbagliato ("000000" o simile): expected, "Codice non valido.", `totp_abilitato` resta `false` (verificabile su Supabase).

- [ ] **Step 8: Verifica REALE con un telefono — richiede l'utente**

Questo passo non si può completare da soli: serve che l'utente scansioni il QR con Google Authenticator sul proprio telefono e dia il codice reale che l'app genera. Se stai eseguendo questo piano come agente, **fermati qui e chiedi al controller (che a sua volta chiede all'utente)**:

1. Mostra il QR appena generato (o il codice segreto in testo, come alternativa) all'utente.
2. Chiedi all'utente di scansionarlo con Google Authenticator (o di inserire il codice a mano se preferisce) e di darti il codice a 6 cifre che l'app mostra in quel momento.
3. Inserisci quel codice reale nel campo "Codice a 6 cifre" e conferma.

Expected: la conferma riesce, `totp_abilitato` diventa `true` su Supabase. Poi esci (Impostazioni → Esci) e prova ad accedere di nuovo con email + password + un NUOVO codice reale preso in quel momento dal telefono dell'utente (i codici scadono ogni 30 secondi, quindi serve un codice fresco, non quello di prima): expected, accesso riuscito. Prova anche ad accedere lasciando il campo Codice vuoto: expected, "Codice non valido." — il 2FA è davvero obbligatorio ora.

- [ ] **Step 9: Commit**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
git add "app/api/account/totp" components/SicurezzaTotp.jsx "app/(dashboard)/impostazioni/page.js"
git commit -m "Configurazione 2FA da /impostazioni: QR, conferma, disattivazione"
```

---

### Task 5: Deploy, verifica in produzione, rimozione di `DASHBOARD_PASSWORD`

**Files:**
- Modify: `.env.local` (rimuove `DASHBOARD_PASSWORD`)

**Interfaces:** nessuna.

- [ ] **Step 1: Verificare che `DASHBOARD_PASSWORD` non sia più referenziata nel codice**

```bash
cd "C:/000_Cowork_Claude/Elyra_Memoria"
grep -rn "DASHBOARD_PASSWORD" app lib components
```

Expected: nessun risultato (il Task 3 ha già sostituito l'unico punto che la usava).

- [ ] **Step 2: Chiedere il permesso di fare push**

**Prima di procedere, ricorda al controller/utente: dopo il push, l'UNICO modo per accedere alla dashboard in produzione sarà email + password (+ codice, se già configurato in locale — ma la configurazione 2FA locale e quella di produzione sono la STESSA riga Supabase, quindi se il Task 4 è stato completato in locale, `totp_abilitato` è già `true` anche in produzione). Assicurarsi che l'utente ricordi email e password prima di procedere.**

- [ ] **Step 3: Push**

```bash
git push origin master
```

- [ ] **Step 4: Verificare subito in produzione**

Apri `https://elyra-memoria.vercel.app/` in una finestra dove NON sei già autenticato (es. navigazione in incognito). Prova ad accedere con email + password (+ codice reale dal telefono, se il 2FA è già attivo). Expected: accesso riuscito, dashboard visibile.

**Se l'accesso fallisce**: non toccare `DASHBOARD_PASSWORD` né fare altre modifiche di fretta. Il modo più sicuro per uscire dall'impasse è `git revert` dell'ultimo commit e un nuovo push, per tornare temporaneamente al vecchio login funzionante, poi capire con calma cosa è andato storto (es. controllare che le variabili d'ambiente Supabase su Vercel siano le stesse di locale — dovrebbero già esserlo, dato che questo progetto usa lo stesso Supabase ovunque).

- [ ] **Step 5: Rimuovere `DASHBOARD_PASSWORD`**

Solo dopo aver confermato che il nuovo accesso funziona in produzione: rimuovi la riga `DASHBOARD_PASSWORD=...` da `.env.local`, e chiedi all'utente di rimuovere la stessa variabile da Vercel (Settings → Environment Variables). Non serve ridistribuire per questo — la variabile semplicemente non viene più letta da nessun codice dopo il Task 3.

- [ ] **Step 6: Riferire il risultato**

---

## Note per chi esegue questo piano

- Questo piano tocca l'accesso all'app — l'unico modo per entrare nella dashboard. Verifica **sempre** in locale prima di passare al task successivo: locale e produzione condividono lo stesso Supabase, quindi un test locale riuscito è un'evidenza forte (non assoluta) che la produzione funzionerà uguale.
- Il Task 4 Step 8 richiede un umano con un telefono — non è simulabile. Fermati e chiedi, non indovinare un codice.
- Il Task 3 Step 4 (creazione della riga `account_auth`) richiede l'email e la password reali dell'utente (Step 2) — non inventarle né usare segnaposto.
- Segui l'ordine dei task: il Task 3 dipende da `hashPassword`/`verifyPassword` (Task 1) e `verificaCodice` (Task 2); il Task 4 dipende da `getAccountAuth`/`updateAccountAuth` (Task 3).
