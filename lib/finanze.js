import "server-only";
import { google } from "googleapis";
import { anthropic, MODEL, estraiJson, testoDaRisposta } from "./ai";
import { getLogGiornaliero, updateLogGiornaliero, getLogGiornalieroRange } from "./store";
import { oggiISO } from "./date";

const SYSTEM = `Ricevi il contenuto di un foglio di calcolo con le finanze personali di qualcuno,
un foglio alla volta, come griglie di testo. Il foglio non ha uno schema fisso: è la storia di
come una persona ha tenuto i suoi conti nel tempo, con fogli vecchi, colonne che hanno cambiato
significato, totali scritti più volte.

Estrai: patrimonio netto totale, valuta, data di riferimento (se presente nel foglio, altrimenti
oggi), e le categorie che lo compongono (nome, valore, tipo: uno tra "liquidita", "investito", "debito").

Regole:
- Se il file ha un foglio di riepilogo e fogli di dettaglio per le stesse voci, NON sommare
  entrambi: conterebbe ogni euro due volte. Usa il riepilogo se c'è, altrimenti somma i dettagli.
- Da un foglio con una serie storica (una tabella con più date), usa SOLO la riga più recente,
  non la somma della colonna.
- Se qualcosa è ambiguo — non sai se un foglio è già incluso in un totale, un dato è vecchio,
  una colonna non è chiara — scrivilo nel campo "note", non deciderlo in silenzio.

Rispondi SOLO con un oggetto JSON, senza testo prima o dopo:
{"patrimonio_netto": numero, "valuta": "EUR", "data_riferimento": "YYYY-MM-DD o null",
"categorie": [{"nome": "...", "valore": numero, "tipo": "liquidita|investito|debito"}],
"note": "eventuali ambiguità, o stringa vuota"}`;

function decodificaChiavePrivata(chiave) {
  // Gli a-capo di una chiave privata si perdono facilmente nel viaggio
  // JSON -> variabile d'ambiente: qui si ripristinano (Parte 7.3, 8).
  return chiave.replace(/\\n/g, "\n");
}

async function clienteSheets() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: decodificaChiavePrivata(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ""),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function leggiFoglioComeTesto() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_FINANCE_ID;
  const sheets = await clienteSheets();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const nomiFogli = meta.data.sheets.map((s) => s.properties.title);

  const blocchi = [];
  for (const nome of nomiFogli) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: nome,
    });
    const righe = res.data.values || [];
    if (righe.length === 0) continue;
    const griglia = righe.map((riga) => riga.join(" | ")).join("\n");
    blocchi.push(`--- Foglio: ${nome} ---\n${griglia}`);
  }

  return blocchi.join("\n\n");
}

// Il caricamento della pagina non chiama mai questa funzione: parte solo
// dal pulsante o dal cron notturno (regola ferrea, Parte 5.8).
export async function aggiornaPolsoFinanziario() {
  if (!anthropic) {
    throw new Error("chiave Anthropic mancante");
  }
  const testoFogli = await leggiFoglioComeTesto();
  if (!testoFogli.trim()) {
    throw new Error("il foglio risulta vuoto o non raggiungibile");
  }

  const risposta = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: testoFogli }],
  });

  const parsed = estraiJson(testoDaRisposta(risposta));
  if (!parsed || typeof parsed.patrimonio_netto !== "number" || !Array.isArray(parsed.categorie)) {
    throw new Error("risposta del modello non valida");
  }

  const oggi = oggiISO();
  const istantanea = {
    patrimonio_netto: parsed.patrimonio_netto,
    valuta: parsed.valuta || "EUR",
    data_riferimento: parsed.data_riferimento || oggi,
    categorie: parsed.categorie,
    note: parsed.note || "",
    generato_alle: new Date().toISOString(),
  };

  await updateLogGiornaliero(oggi, { finanze: istantanea });
  return istantanea;
}

function trentaGiorniFa(oggi) {
  const [y, m, d] = oggi.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 30);
  return dt.toISOString().slice(0, 10);
}

// Legge sempre l'ultima istantanea salvata — mai il foglio in diretta
// (Parte 5.8). Il delta è contro la snapshot valida più vecchia trovata
// negli ultimi trenta giorni, non necessariamente esattamente a 30 giorni.
export async function leggiUltimoPolso() {
  const oggi = oggiISO();
  const righe = await getLogGiornalieroRange(trentaGiorniFa(oggi), oggi);
  const conSnapshot = righe.filter((r) => r.finanze && typeof r.finanze.patrimonio_netto === "number");

  if (conSnapshot.length === 0) return { istantanea: null, delta: null, dataConfronto: null };

  conSnapshot.sort((a, b) => b.data.localeCompare(a.data));
  const ultima = conSnapshot[0].finanze;
  const precedente = conSnapshot[1];

  const delta = precedente ? ultima.patrimonio_netto - precedente.finanze.patrimonio_netto : null;
  return { istantanea: ultima, delta, dataConfronto: precedente?.data || null };
}
