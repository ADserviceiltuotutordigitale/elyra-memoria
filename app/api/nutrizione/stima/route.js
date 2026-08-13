import { anthropic, MODEL, estraiJson, testoDaRisposta } from "@/lib/ai";
import { getLogGiornaliero, updateLogGiornaliero } from "@/lib/store";
import { oggiISO } from "@/lib/date";

const SYSTEM = `Stimi calorie e macronutrienti di un pasto a partire dalla sua descrizione in italiano.
Rispondi SOLO con un oggetto JSON, senza testo prima o dopo:
{"nome": "riformulazione breve del pasto", "calorie": numero, "proteine": grammi, "carboidrati": grammi, "grassi": grammi}
I quattro numeri devono essere coerenti con la formula 4*proteine + 4*carboidrati + 9*grassi = calorie.`;

// Niente rete di sicurezza a regole qui: per lo smistamento un fallback
// grezzo ha senso, per inventare calorie no — meglio dire chiaramente
// che la stima non è riuscita (Parte 5.5).
export async function POST(request) {
  const { descrizione } = await request.json().catch(() => ({}));
  if (!descrizione || !descrizione.trim()) {
    return Response.json({ error: "descrizione mancante" }, { status: 400 });
  }
  if (!anthropic) {
    return Response.json({ error: "stima non disponibile" }, { status: 503 });
  }

  let stima;
  try {
    const risposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: "user", content: descrizione }],
    });
    stima = estraiJson(testoDaRisposta(risposta));
    if (!stima || typeof stima.calorie !== "number") throw new Error("risposta non valida");
  } catch {
    return Response.json({ error: "stima non riuscita, riprova" }, { status: 502 });
  }

  const oggi = oggiISO();
  const log = await getLogGiornaliero(oggi);
  const pasto = {
    id: crypto.randomUUID(),
    ora: new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: process.env.USER_TIMEZONE || "Europe/Rome",
    }).format(new Date()),
    nome: stima.nome || descrizione,
    calorie: Math.round(stima.calorie),
    proteine: Math.round(stima.proteine || 0),
    carboidrati: Math.round(stima.carboidrati || 0),
    grassi: Math.round(stima.grassi || 0),
    stimato: true,
  };

  const pasti = [...(log.pasti || []), pasto];
  await updateLogGiornaliero(oggi, { pasti });

  return Response.json({ pasti });
}
