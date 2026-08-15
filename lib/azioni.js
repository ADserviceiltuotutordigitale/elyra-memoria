import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getTask } from "./store";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Decidi se questa frase è un comando per rimuovere o
completare un task esistente da questo elenco (JSON, {id, titolo}):

{{ELENCO}}

Se è chiaramente un comando di questo tipo E riesci a identificare con
sicurezza UN SOLO task dell'elenco a cui si riferisce, rispondi con:
{"azione": "elimina" o "completa", "taskId": "l'id esatto dall'elenco"}

In ogni altro caso — non è un comando di rimozione/completamento, oppure lo è
ma non riesci a scegliere un solo task con sicurezza (ambiguo, nessuna
corrispondenza sufficiente) — rispondi con:
{"azione": null, "taskId": null}

Non inventare mai un id che non è nell'elenco. Rispondi SOLO con l'oggetto
JSON, senza testo prima o dopo.`;

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

// Nessuna rete di sicurezza a regole qui (a differenza di classify()): se il
// modello non è disponibile o la chiamata fallisce, si considera "nessuna
// azione" e il testo prosegue verso la cattura normale — mai peggiorativo
// rispetto al comportamento di prima di questa funzione.
export async function rilevaAzioneSuTask(testo) {
  if (!anthropic) return { azione: null, taskId: null };

  const taskAperti = await getTask();
  if (taskAperti.length === 0) return { azione: null, taskId: null };

  const elenco = taskAperti.map((t) => ({ id: t.id, titolo: t.titolo }));
  const idValidi = new Set(elenco.map((t) => t.id));

  let risposta;
  try {
    risposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT.replace("{{ELENCO}}", JSON.stringify(elenco)),
      messages: [{ role: "user", content: testo }],
    });
  } catch {
    return { azione: null, taskId: null };
  }

  const testoRisposta = risposta.content
    .filter((blocco) => blocco.type === "text")
    .map((blocco) => blocco.text)
    .join("");

  const parsed = estraiJson(testoRisposta);
  if (!parsed) return { azione: null, taskId: null };

  const azioneValida = parsed.azione === "elimina" || parsed.azione === "completa";
  if (!azioneValida || !idValidi.has(parsed.taskId)) {
    return { azione: null, taskId: null };
  }

  const task = elenco.find((t) => t.id === parsed.taskId);
  return { azione: parsed.azione, taskId: parsed.taskId, titolo: task.titolo };
}
