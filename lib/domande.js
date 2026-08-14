import "server-only";
import { anthropic, MODEL, testoDaRisposta } from "./ai";
import { calcolaEmbedding } from "./embedding";
import { getProfilo, searchMemoria } from "./store";

const SYSTEM = `Rispondi alla domanda dell'utente usando esclusivamente le informazioni fornite
qui sotto: il suo profilo e una lista di voci di memoria, ognuna con una data.
Per ogni affermazione che fai, cita da quale voce viene (la data basta). Se l'informazione
che ti chiede non è tra quelle fornite, dillo chiaramente — "non lo so" o equivalente — invece
di inventare una risposta plausibile. Rispondi in italiano, breve e diretto.`;

// La memoria per somiglianza (Parte 6, A16): invece di passare tutto il
// contesto, si prendono solo le venti voci più vicine alla domanda.
// Condivisa da /api/domande (barra) e dal webhook Telegram (A17).
export async function rispondiADomanda(domanda) {
  if (!anthropic) {
    throw new Error("risposta non disponibile");
  }

  const embedding = await calcolaEmbedding(domanda);
  const [profilo, voci] = await Promise.all([
    getProfilo(),
    embedding ? searchMemoria(embedding, { limit: 20 }) : Promise.resolve([]),
  ]);

  const contesto = {
    profilo: { nome: profilo.nome, ruolo: profilo.ruolo, citta: profilo.citta },
    memoria: voci.map((v) => ({ testo: v.testo, data: v.created_at, provenienza: v.provenienza })),
  };

  const risposta = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM,
    messages: [{ role: "user", content: `Contesto: ${JSON.stringify(contesto)}\n\nDomanda: ${domanda}` }],
  });

  return { risposta: testoDaRisposta(risposta), fontiUsate: voci.length };
}
