import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { oggiISO } from "./date";

// L'elenco canonico delle destinazioni — vive qui, un posto solo.
// Cambiarle vuol dire cambiare questa riga, non andare a caccia di
// stringhe sparse nel resto del codice (Parte 4).
export const DESTINAZIONI = ["task", "persone", "finanze", "obiettivi", "memoria", "calendario"];

const URGENZE_VALIDE = ["oggi", "settimana", "piu_avanti"];
const URGENZA_PREDEFINITA = "oggi";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Haiku: la classificazione è un compito piccolo e frequente, non serve
// un modello più pesante — vedi Parte 1.4 sulle tarature di velocità.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Sei il classificatore di Elyra, un sistema personale di note e task.
Ricevi una frase scritta o detta a voce e decidi dove va archiviata.
Oggi è {{OGGI}} (formato AAAA-MM-GG).

Destinazioni possibili, una sola:
- task: un'azione generica da fare, senza una casa più precisa
- persone: qualcosa legato a una persona specifica (richiamare, rispondere, contattare)
- finanze: spese, pagamenti, entrate, importi in denaro
- obiettivi: una promessa o un traguardo, non un'azione immediata
- memoria: un pensiero, una riflessione, qualcosa da ricordare senza azione
- calendario: un appuntamento o impegno con una data specifica (anche "il 24 agosto", "domani", "lunedì prossimo")

Se il testo contiene una data o un giorno specifico per un impegno (anche se
nomina anche una persona), la destinazione è sempre "calendario" — vince su
"persone" e su "task".

Urgenza, una sola tra: "oggi", "settimana", "piu_avanti".
Se non è chiaro, usa "oggi". Non usare mai "in_ritardo": ci si finisce restando
fermi, non è un valore che assegni tu.

Se destinazione è "calendario": deduci la data assoluta menzionata nel testo
(formato AAAA-MM-GG, usando la data di oggi sopra come riferimento — es. "il 24
agosto" è il prossimo 24 agosto da oggi in poi, mai una data già passata) e
mettila nel campo "data" (sempre presente per questa destinazione). Se nel
testo è menzionato anche un orario, mettilo nel campo "ora" in formato "HH:MM"
(24 ore); altrimenti "ora": null. Per ogni altra destinazione, "data" e "ora"
sono sempre null.

Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con questa forma:
{"destinazione": "...", "titolo": "riformulazione breve", "persona": "nome o null", "urgenza": "...", "data": "AAAA-MM-GG o null", "ora": "HH:MM o null"}`;

function estraiJson(testo) {
  const inizio = testo.indexOf("{");
  const fine = testo.lastIndexOf("}");
  if (inizio === -1 || fine === -1 || fine < inizio) return null;
  try {
    return JSON.parse(testo.slice(inizio, fine + 1));
  } catch {
    return null;
  }
}

function normalizzaUrgenza(urgenza) {
  return URGENZE_VALIDE.includes(urgenza) ? urgenza : URGENZA_PREDEFINITA;
}

// La rete di sicurezza a regole (Parte 1.4, 4 e 8): entra in funzione
// quando la chiave manca, la chiamata fallisce, o il modello inventa una
// destinazione che non esiste. La cattura non fallisce mai — al massimo
// smista peggio.
const REGOLE = [
  { destinazione: "finanze", parole: ["euro", "€", "fattura", "pagat", "spes", "costo", "prezzo", "bolletta", "stipendio"] },
  { destinazione: "persone", parole: ["chiamare", "richiamare", "rispondere a", "contattare", "scrivere a", "email a"] },
  { destinazione: "obiettivi", parole: ["obiettivo", "entro fine", "traguardo", "mi sono promesso"] },
  { destinazione: "memoria", parole: ["ricordami", "pensiero", "riflessione", "idea"] },
];

function classificaConRegole(testo) {
  const minuscolo = testo.toLowerCase();
  const regola = REGOLE.find((r) => r.parole.some((p) => minuscolo.includes(p)));
  return {
    destinazione: regola?.destinazione ?? "task",
    titolo: testo.length > 80 ? testo.slice(0, 77) + "…" : testo,
    persona: null,
    urgenza: URGENZA_PREDEFINITA,
    data: null,
    ora: null,
    via: "regole",
  };
}

export async function classify(testo) {
  if (!anthropic) {
    return classificaConRegole(testo);
  }

  let risposta;
  try {
    risposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT.replace("{{OGGI}}", oggiISO()),
      messages: [{ role: "user", content: testo }],
      // Niente "thinking" qui: è opt-in sull'API, di default è spento, e
      // deve restarci — smistare una frase non ne ha bisogno, e il
      // ragionamento esteso trasforma un'attesa di secondi in molta di più.
    });
  } catch {
    return classificaConRegole(testo);
  }

  const testoRisposta = risposta.content
    .filter((blocco) => blocco.type === "text")
    .map((blocco) => blocco.text)
    .join("");

  const parsed = estraiJson(testoRisposta);
  if (!parsed || !DESTINAZIONI.includes(parsed.destinazione)) {
    return classificaConRegole(testo);
  }

  return {
    destinazione: parsed.destinazione,
    titolo: parsed.titolo || testo,
    persona: parsed.persona || null,
    urgenza: normalizzaUrgenza(parsed.urgenza),
    data: parsed.data || null,
    ora: parsed.ora || null,
    via: "modello",
  };
}

export async function interpretaOrarioRisposta(testo, contesto) {
  if (!anthropic) return { capito: false, ora: null };

  const prompt = `Il messaggio è una possibile risposta alla domanda "a che ora?" per
l'evento di calendario "${contesto.titolo}" il ${contesto.data}, appena chiesta.

Se il messaggio indica chiaramente un orario per QUESTO evento, rispondi
{"capito": true, "ora": "HH:MM"} (24 ore).
Se dice che è per tutto il giorno (es. "tutto il giorno", "nessun orario",
"giornata intera"), rispondi {"capito": true, "ora": null}.
Se il messaggio sembra invece una richiesta nuova e diversa (un altro
appuntamento, un task, qualcosa che non c'entra con "${contesto.titolo}"),
oppure non è affatto una risposta su un orario, rispondi
{"capito": false, "ora": null} — anche se contiene un orario, se sembra
riferirsi a qualcos'altro rispondi capito: false.
Rispondi SOLO con l'oggetto JSON, senza testo prima o dopo.`;

  let risposta;
  try {
    risposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 100,
      system: prompt,
      messages: [{ role: "user", content: testo }],
    });
  } catch {
    return { capito: false, ora: null };
  }

  const testoRisposta = risposta.content
    .filter((blocco) => blocco.type === "text")
    .map((blocco) => blocco.text)
    .join("");

  const parsed = estraiJson(testoRisposta);
  if (!parsed || typeof parsed.capito !== "boolean") return { capito: false, ora: null };
  return { capito: parsed.capito, ora: parsed.ora || null };
}
