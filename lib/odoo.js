import "server-only";

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY = process.env.ODOO_API_KEY;

// Conti noti (5): non serve un'interfaccia per gestire questa mappatura.
// Il confronto è per PREFISSO (non nome esatto) sulla sola parte stabile
// e non sensibile del nome del giornale — banca/servizio, mai l'IBAN, che
// invece compare nel nome reale del giornale in Odoo (repo pubblico, vedi
// finding critico della review finale). Verificato allo Step 4 di questo
// task — vedi la spec:
// docs/superpowers/specs/2026-08-14-odoo-finanze-integration-design.md
// "PayPal EUR" è classificato qui esplicitamente come "personale" — è una
// decisione presa (non un caso ricaduto sul fallback di ambitoDiConto,
// che resta riservato a conti futuri/sconosciuti). Vedi task-1-report.md.
const MAPPATURA_CONTI = [
  { prefisso: "BBVA", ambito: "personale" },
  { prefisso: "PayPal EUR", ambito: "personale" },
  { prefisso: "WeBank", ambito: "personale" },
  { prefisso: "Poste Bussines", ambito: "lavoro" },
  { prefisso: "Revolut", ambito: "personale" },
];

function ambitoDiConto(nome) {
  const voce = MAPPATURA_CONTI.find((c) => nome.startsWith(c.prefisso));
  return voce ? voce.ambito : "personale";
}

// L'API esterna di Odoo (JSON-RPC): un'unica busta per ogni chiamata,
// "service" + "method" + "args" a seconda che si parli con "common"
// (autenticazione) o "object" (lettura/scrittura sui modelli).
async function chiamaOdoo(service, method, args) {
  let res;
  try {
    res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
        id: Math.floor(Math.random() * 1000000),
      }),
    });
  } catch (errore) {
    // fetch stesso ha lanciato: rete giù, DNS, connessione rifiutata, ecc.
    throw new Error(`[odoo] ${method}: richiesta di rete fallita — ${errore.message}`);
  }

  if (!res.ok) {
    // Risposta non-2xx: può essere una pagina di errore del proxy/del
    // server (HTML, non JSON), quindi non tentiamo nemmeno res.json().
    throw new Error(`[odoo] ${method}: risposta HTTP ${res.status} ${res.statusText} dal server Odoo`);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    // 2xx ma corpo non JSON valido — non dovrebbe succedere, ma non
    // vogliamo far propagare un SyntaxError grezzo.
    throw new Error(`[odoo] ${method}: risposta non valida (non JSON) dal server Odoo`);
  }

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
