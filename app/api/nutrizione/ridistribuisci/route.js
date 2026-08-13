import { anthropic, MODEL, estraiJson, testoDaRisposta } from "@/lib/ai";
import { getLogGiornaliero, updateLogGiornaliero } from "@/lib/store";
import { oggiISO } from "@/lib/date";

const SYSTEM = `Ricevi il nome di un pasto e le sue nuove calorie totali. Restituisci macronutrienti
plausibili e coerenti con quella cifra (4*proteine + 4*carboidrati + 9*grassi = calorie).
Rispondi SOLO con un oggetto JSON: {"proteine": grammi, "carboidrati": grammi, "grassi": grammi}`;

// Qui la formula da sola avrebbe infinite soluzioni: si scala per
// proporzione solo se il modello non risponde (Parte 5.5).
function ridistribuzioneProporzionale(pasto, nuoveCalorie) {
  const fattore = pasto.calorie > 0 ? nuoveCalorie / pasto.calorie : 0;
  return {
    proteine: Math.round(pasto.proteine * fattore),
    carboidrati: Math.round(pasto.carboidrati * fattore),
    grassi: Math.round(pasto.grassi * fattore),
  };
}

export async function POST(request) {
  const { id, calorie } = await request.json().catch(() => ({}));
  if (!id || typeof calorie !== "number") {
    return Response.json({ error: "parametri mancanti" }, { status: 400 });
  }

  const oggi = oggiISO();
  const log = await getLogGiornaliero(oggi);
  const pasti = log.pasti || [];
  const pasto = pasti.find((p) => p.id === id);
  if (!pasto) {
    return Response.json({ error: "pasto non trovato" }, { status: 404 });
  }

  let macro;
  if (anthropic) {
    try {
      const risposta = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM,
        messages: [{ role: "user", content: `${pasto.nome}, ${calorie} kcal` }],
      });
      const parsed = estraiJson(testoDaRisposta(risposta));
      if (parsed && typeof parsed.proteine === "number") {
        macro = {
          proteine: Math.round(parsed.proteine),
          carboidrati: Math.round(parsed.carboidrati),
          grassi: Math.round(parsed.grassi),
        };
      }
    } catch {
      // ripiega sotto
    }
  }
  if (!macro) macro = ridistribuzioneProporzionale(pasto, calorie);

  const pastiAggiornati = pasti.map((p) =>
    p.id === id ? { ...p, calorie: Math.round(calorie), ...macro, stimato: false } : p
  );
  await updateLogGiornaliero(oggi, { pasti: pastiAggiornati });

  return Response.json({ pasti: pastiAggiornati });
}
