import { getProfilo, getLogGiornalieroRange } from "@/lib/store";
import { leggiUltimoPolso } from "@/lib/finanze";
import { oggiISO, giorniFa } from "@/lib/date";
import { calcolaStriscia } from "@/lib/streak";

// Alimenta la striscia strumenti nella barra in alto (tutte le pagine).
export async function GET() {
  const oggi = oggiISO();
  const [profilo, log, polso] = await Promise.all([
    getProfilo(),
    getLogGiornalieroRange(giorniFa(oggi, 30), oggi),
    leggiUltimoPolso(),
  ]);

  const streak = calcolaStriscia(log, oggi);

  let deltaPercento = null;
  if (polso.istantanea && polso.delta !== null) {
    const precedente = polso.istantanea.patrimonio_netto - polso.delta;
    if (precedente !== 0) deltaPercento = (polso.delta / precedente) * 100;
  }

  return Response.json(
    { streak, focus: profilo.focus_del_giorno || null, deltaPercento },
    { headers: { "Cache-Control": "no-store" } }
  );
}
