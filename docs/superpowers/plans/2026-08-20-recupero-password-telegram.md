# Recupero password via Telegram — Piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: usa superpowers:subagent-driven-development (consigliata) o superpowers:executing-plans per eseguire questo piano un task alla volta. Gli step usano la sintassi checkbox (`- [ ]`) per il tracking.

**Obiettivo:** Aggiungere un pulsante "Password dimenticata?" alla pagina di login che manda, via il bot Telegram già esistente, un link di reset valido 15 minuti; una nuova pagina permette di scegliere la nuova password senza toccare il 2FA.

**Architettura:** Tre colonne nuove su `account_auth` (`reset_token_hash`, `reset_token_scade`, `reset_richiesto_il`) per un token monouso hashato SHA-256, mai salvato in chiaro. Due nuove rotte pubbliche sotto `/api/auth/` (già esenti in `proxy.js`): una genera il token e manda il link su Telegram, l'altra lo verifica e aggiorna la password. Una nuova pagina pubblica sotto `/login/` (già esente) ospita il form della nuova password.

**Tech Stack:** Next.js 16 App Router (JavaScript), Supabase (via `lib/store.js`), `crypto` nativo di Node per token/hash, API Telegram `sendMessage` (stesso pattern già in uso in `lib/briefing.js`).

## Vincoli globali

- Nessun nuovo pacchetto npm.
- Nessuna modifica a `proxy.js` — le due nuove rotte e la nuova pagina rientrano già nei prefissi pubblici esistenti (`/api/auth/`, `/login`).
- Nessuna modifica a `lib/auth.js`, `lib/totp.js` — riusati identici (`constantTimeEqual` da `lib/auth.js`, `hashPassword` da `lib/password.js`).
- Il token di reset non va **mai** salvato in chiaro nel database — solo il suo hash SHA-256 (`crypto.createHash("sha256")`), a differenza di `totp_secret` che resta in chiaro per necessità algoritmica.
- Il reset password non deve mai modificare `totp_secret` / `totp_abilitato`.
- Nessun framework di test nel progetto: ogni task si verifica con `npm run dev` + `curl`/browser, stesso approccio già usato nel piano `2026-08-19-account-email-2fa`.
- Stile del codice: italiano per nomi di funzioni/variabili/commenti, coerente col resto del repo (`generaSegreto`, `verificaCodice`, `hashPassword`, ecc.).

---

### Task 1: Migrazione + rotta di richiesta reset

**File:**
- Crea: `supabase/migrations/0004_recupero_password.sql`
- Modifica: `lib/password.js:1-17` (aggiunge due funzioni)
- Crea: `app/api/auth/richiedi-reset/route.js`

**Interfacce:**
- Consuma: `getAccountAuth()`/`updateAccountAuth(patch)` da `lib/store.js` (esistenti, invariati — leggono/scrivono l'intera riga per campi, quindi le nuove colonne non richiedono modifiche a `lib/store.js`).
- Produce: `generaTokenReset()` e `hashToken(token)` in `lib/password.js`, usate anche dal Task 2. `POST /api/auth/richiedi-reset` (nessun corpo in ingresso) → sempre `{ ok: true }`.

- [ ] **Step 1: Migrazione**

Crea `supabase/migrations/0004_recupero_password.sql`:

```sql
alter table account_auth
  add column reset_token_hash text,
  add column reset_token_scade timestamptz,
  add column reset_richiesto_il timestamptz;
```

Tutte e tre nullable (default `null` per riga esistente). Nessuna `policy` nuova — stessa riga di sicurezza già in vigore su `account_auth` (RLS abilitata, nessuna policy, solo la chiave di servizio la vede).

- [ ] **Step 2: Applicare la migrazione su Supabase**

L'utente esegue l'SQL sopra nell'SQL Editor di Supabase (stesso procedimento già seguito per `0003_account_auth.sql`). Verificare con una query REST diretta che `account_auth` ora esponga le tre colonne nuove (es. `select reset_token_hash from account_auth` non deve più dare errore di colonna inesistente).

- [ ] **Step 3: Due funzioni nuove in `lib/password.js`**

Aggiungere in coda al file esistente (non toccare `hashPassword`/`verifyPassword`):

```js
export function generaTokenReset() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token ?? "").digest("hex");
}
```

- [ ] **Step 4: Rotta `POST /api/auth/richiedi-reset`**

Crea `app/api/auth/richiedi-reset/route.js`:

```js
import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { generaTokenReset, hashToken } from "@/lib/password";

const FINESTRA_LIMITE_MS = 60 * 1000;
const SCADENZA_MS = 15 * 60 * 1000;

export async function POST(request) {
  const account = await getAccountAuth();
  if (!account) {
    return Response.json({ ok: true });
  }

  const ora = Date.now();
  if (account.reset_richiesto_il) {
    const ultimaRichiesta = new Date(account.reset_richiesto_il).getTime();
    if (ora - ultimaRichiesta < FINESTRA_LIMITE_MS) {
      return Response.json({ ok: true });
    }
  }

  const token = generaTokenReset();

  await updateAccountAuth({
    reset_token_hash: hashToken(token),
    reset_token_scade: new Date(ora + SCADENZA_MS).toISOString(),
    reset_richiesto_il: new Date(ora).toISOString(),
  });

  const origin = new URL(request.url).origin;
  const link = `${origin}/login/reimposta?token=${token}`;

  try {
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_USER_ID,
          text: `Reimposta la password di Elyra (valido 15 minuti):\n${link}`,
        }),
      }
    );
  } catch (err) {
    console.error("[richiedi-reset] invio Telegram fallito", err);
  }

  return Response.json({ ok: true });
}
```

Nota: `try/catch` solo sull'eccezione di rete — non si controlla `res.ok` della risposta Telegram, perché un fallimento di consegna non deve comunque cambiare la risposta data al chiamante (principio già scelto nello spec: sempre `{ ok: true }`).

- [ ] **Step 5: Verifica manuale**

Con `npm run dev` attivo e le env var reali (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_USER_ID`) presenti in `.env.local`:

```bash
curl -X POST http://localhost:3000/api/auth/richiedi-reset
```

Atteso: `{"ok":true}`, un messaggio reale arriva sul Telegram configurato in `TELEGRAM_USER_ID`, e su Supabase (`account_auth` id=1) risultano valorizzate `reset_token_hash`, `reset_token_scade` (~15 minuti nel futuro), `reset_richiesto_il` (adesso). **Non serve verificare il contenuto del token in chiaro** — solo che l'hash sia presente e diverso da vuoto.

Rilanciare subito una seconda `curl` identica: atteso `{"ok":true}` ma **nessun secondo messaggio Telegram** e nessuna modifica a `reset_token_hash` su Supabase (finestra dei 60 secondi).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_recupero_password.sql lib/password.js app/api/auth/richiedi-reset/route.js
git commit -m "Rotta di richiesta reset password via Telegram"
```

---

### Task 2: Rotta di conferma reset

**File:**
- Crea: `app/api/auth/reimposta-password/route.js`

**Interfacce:**
- Consuma: `getAccountAuth()`/`updateAccountAuth(patch)` da `lib/store.js`; `hashToken(token)` da `lib/password.js` (Task 1); `hashPassword(password)` da `lib/password.js` (esistente); `constantTimeEqual(a, b)` da `lib/auth.js` (esistente).
- Produce: `POST /api/auth/reimposta-password` con corpo `{ token, password }` → `{ ok: true }` o `{ ok: false, error }` con status 400/401. Il Task 3 (pagina) chiama questa rotta esattamente con questi due campi.

- [ ] **Step 1: Rotta `POST /api/auth/reimposta-password`**

Crea `app/api/auth/reimposta-password/route.js`:

```js
import { constantTimeEqual } from "@/lib/auth";
import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { hashPassword, hashToken } from "@/lib/password";

export async function POST(request) {
  const { token, password } = await request.json().catch(() => ({}));

  if (!password || password.length < 8) {
    return Response.json(
      { ok: false, error: "Password troppo corta." },
      { status: 400 }
    );
  }

  const account = await getAccountAuth();
  if (!account || !account.reset_token_hash || !account.reset_token_scade) {
    return Response.json(
      { ok: false, error: "Link non valido o scaduto." },
      { status: 401 }
    );
  }

  const scaduto = new Date(account.reset_token_scade).getTime() < Date.now();
  const tokenValido = constantTimeEqual(hashToken(token), account.reset_token_hash);

  if (scaduto || !tokenValido) {
    return Response.json(
      { ok: false, error: "Link non valido o scaduto." },
      { status: 401 }
    );
  }

  await updateAccountAuth({
    password_hash: hashPassword(password),
    reset_token_hash: null,
    reset_token_scade: null,
    reset_richiesto_il: null,
  });

  return Response.json({ ok: true });
}
```

Invariante da rispettare: questa rotta non deve mai scrivere `totp_secret` o `totp_abilitato` nel `patch` passato a `updateAccountAuth` — il 2FA resta esattamente com'era prima del reset.

- [ ] **Step 2: Verifica manuale — caso valido**

Prerequisito: aver girato il Task 1 Step 5 così da avere un `reset_token_hash` reale su Supabase generato da un token noto. Per ottenere il token in chiaro corrispondente senza intercettarlo dal messaggio Telegram reale, è sufficiente rileggere l'ultimo messaggio ricevuto sul bot (il link contiene il token in chiaro nella query string) — non serve alcuno script separato.

```bash
curl -X POST http://localhost:3000/api/auth/reimposta-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<token dal link ricevuto su Telegram>","password":"unaPasswordDiProvaAbbastanzaLunga"}'
```

Atteso: `{"ok":true}`. Su Supabase, `password_hash` è cambiato e `reset_token_hash`/`reset_token_scade`/`reset_richiesto_il` sono tornati `null`.

**Importante:** questo cambia davvero la password reale dell'account. Subito dopo la verifica, va rifatto un reset (Task 1 Step 5 + questo step) per riportare l'account a una password nota, oppure va concordata con l'utente in anticipo la password di prova da usare come password finale. Non lasciare l'account con una password nota solo al processo di test.

- [ ] **Step 3: Verifica manuale — casi di rifiuto**

```bash
curl -X POST http://localhost:3000/api/auth/reimposta-password \
  -H "Content-Type: application/json" \
  -d '{"token":"token-inventato-che-non-esiste","password":"qualsiasiCosaLunga"}'
```

Atteso: `401 {"ok":false,"error":"Link non valido o scaduto."}`.

```bash
curl -X POST http://localhost:3000/api/auth/reimposta-password \
  -H "Content-Type: application/json" \
  -d '{"token":"qualsiasi","password":"corta"}'
```

Atteso: `400 {"ok":false,"error":"Password troppo corta."}`.

Riusare un token già consumato dallo Step 2 (rilanciare la stessa curl di prima): atteso `401`, dato che `reset_token_hash` è stato azzerato — dimostra che il token è monouso.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/reimposta-password/route.js
git commit -m "Rotta di conferma reset password"
```

---

### Task 3: Pagina di reset + pulsante nella pagina di login

**File:**
- Crea: `app/login/reimposta/page.js`
- Crea: `app/login/reimposta/ReimpostaPasswordForm.jsx`
- Modifica: `app/login/page.js` (tutto il file — aggiunge il pulsante e corregge l'etichetta del campo codice)

**Interfacce:**
- Consuma: `POST /api/auth/richiedi-reset` (Task 1), `POST /api/auth/reimposta-password` (Task 2) con `{ token, password }`.
- Produce: nessuna interfaccia nuova per altri task — questo è l'ultimo task del piano.

- [ ] **Step 1: Wrapper con `Suspense`**

`useSearchParams` in App Router richiede un boundary `Suspense` attorno al componente che lo usa, altrimenti la build fallisce. Crea `app/login/reimposta/page.js`:

```jsx
import { Suspense } from "react";
import ReimpostaPasswordForm from "./ReimpostaPasswordForm";

export default function ReimpostaPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ReimpostaPasswordForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Form di reset**

Crea `app/login/reimposta/ReimpostaPasswordForm.jsx`, stesso stile visivo di `app/login/page.js` (`campoStile`, `card`, `btn-refresh`):

```jsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const campoStile = {
  background: "var(--ink-850)",
  border: "1px solid var(--line-soft)",
  borderRadius: 7,
  padding: "10px 12px",
  color: "var(--paper)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
};

const wrapStile = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

export default function ReimpostaPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [conferma, setConferma] = useState("");
  const [error, setError] = useState("");
  const [fatto, setFatto] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== conferma) {
      setError("Le due password non coincidono.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reimposta-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || "Qualcosa è andato storto.");
        setLoading(false);
        return;
      }
      setFatto(true);
    } catch {
      setError("Qualcosa è andato storto. Riprova.");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main style={wrapStile}>
        <div className="card" style={{ width: "100%", maxWidth: 360 }}>
          <div className="card-body">
            <p style={{ fontSize: 13.5 }}>Link non valido.</p>
          </div>
        </div>
      </main>
    );
  }

  if (fatto) {
    return (
      <main style={wrapStile}>
        <div className="card" style={{ width: "100%", maxWidth: 360 }}>
          <div className="card-body">
            <p style={{ fontSize: 13.5, marginBottom: 10 }}>Password aggiornata.</p>
            <Link
              href="/login"
              className="btn-refresh"
              style={{ display: "inline-flex", textDecoration: "none" }}
            >
              Torna al login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={wrapStile}>
      <form onSubmit={handleSubmit} className="card" style={{ width: "100%", maxWidth: 360 }}>
        <div className="card-plate">
          <span className="plate-name">Nuova password</span>
        </div>
        <div className="card-body" style={{ gap: 10 }}>
          <div>
            <label htmlFor="password" style={{ fontSize: 12.5, color: "var(--paper-dim)" }}>
              Nuova password
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...campoStile, width: "100%", marginTop: 4 }}
            />
          </div>
          <div>
            <label htmlFor="conferma" style={{ fontSize: 12.5, color: "var(--paper-dim)" }}>
              Conferma password
            </label>
            <input
              id="conferma"
              type="password"
              value={conferma}
              onChange={(e) => setConferma(e.target.value)}
              style={{ ...campoStile, width: "100%", marginTop: 4 }}
            />
          </div>
          {error && <div style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</div>}
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
            {loading ? "Aggiornamento…" : "Aggiorna password"}
          </button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Pulsante "Password dimenticata?" in `app/login/page.js`**

Modificare `app/login/page.js`: aggiungere due stati (`resetInviato`, `resetLoading`), una funzione `handleReset`, e il blocco JSX del pulsante subito sotto il pulsante "Entra". Correggere anche l'etichetta del campo codice, che oggi recita ancora "Codice (se hai attivato il 2FA)" mentre il 2FA è ormai obbligatorio dopo la configurazione — diventa "Codice 2FA".

File risultante completo:

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
  const [resetInviato, setResetInviato] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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

  async function handleReset() {
    setResetLoading(true);
    try {
      await fetch("/api/auth/richiedi-reset", { method: "POST" });
    } catch {
      // ignora: mostriamo comunque "Controlla Telegram" per non rivelare stato
    }
    setResetLoading(false);
    setResetInviato(true);
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
              Codice 2FA
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
          {resetInviato ? (
            <div style={{ fontSize: 12.5, color: "var(--paper-dim)", textAlign: "center" }}>
              Controlla Telegram.
            </div>
          ) : (
            <button
              type="button"
              onClick={handleReset}
              disabled={resetLoading}
              style={{
                background: "none",
                border: "none",
                color: "var(--paper-dim)",
                fontSize: 12.5,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Password dimenticata?
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Verifica manuale end-to-end nel browser**

Con `npm run dev` attivo:

1. Apri `/login`, clicca "Password dimenticata?" → il pulsante sparisce, appare "Controlla Telegram." — un messaggio reale arriva sul bot.
2. Apri il link ricevuto (porta a `/login/reimposta?token=...`) → appare il form "Nuova password".
3. Prova prima con le due password diverse → atteso errore lato client "Le due password non coincidono." senza chiamata di rete.
4. Invia con le password uguali (scegli qui la password finale che l'utente vuole tenere) → atteso "Password aggiornata." con link "Torna al login".
5. Da `/login`, prova ad accedere con la nuova password + email + codice 2FA corrente → deve funzionare esattamente come prima (il 2FA non deve essere stato toccato dal reset).
6. Apri `/login/reimposta` **senza** query string `token` → atteso "Link non valido." senza form.
7. Riapri lo stesso link di reset già usato al punto 4 → atteso errore "Link non valido o scaduto." (token monouso, già consumato).

Punto 4 e 5 richiedono che l'utente stesso confermi che il login con le nuove credenziali funziona — stessa cautela già seguita nel piano 2FA: chi esegue il task non deve maneggiare la password reale dell'utente.

- [ ] **Step 5: Commit**

```bash
git add app/login/reimposta/page.js app/login/reimposta/ReimpostaPasswordForm.jsx app/login/page.js
git commit -m "Pagina di reset password e pulsante 'Password dimenticata?' nel login"
```
