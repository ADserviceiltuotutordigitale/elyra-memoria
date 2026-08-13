import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Haiku per i compiti piccoli e frequenti (classificazione, stime,
// ricerca) — vedi Parte 1.4. Le risposte più lunghe (domande sulla
// memoria, briefing) possono passare un modello diverso via ANTHROPIC_MODEL.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// Non fidarti che la risposta sia solo JSON: il modello ogni tanto ci
// mette una frase di cortesia prima delle graffe (Parte 8).
export function estraiJson(testo) {
  const inizio = testo.indexOf("{");
  const fine = testo.lastIndexOf("}");
  if (inizio === -1 || fine === -1 || fine < inizio) return null;
  try {
    return JSON.parse(testo.slice(inizio, fine + 1));
  } catch {
    return null;
  }
}

export function testoDaRisposta(risposta) {
  return risposta.content
    .filter((blocco) => blocco.type === "text")
    .map((blocco) => blocco.text)
    .join("");
}
