import { getProfilo } from "@/lib/store";
import { leggiUltimoPolso } from "@/lib/finanze";

// Alimenta la striscia strumenti nella barra in alto (tutte le pagine).
export async function GET() {
  const [profilo, polso] = await Promise.all([getProfilo(), leggiUltimoPolso()]);

  let deltaPercento = null;
  if (polso.istantanea && polso.deltaPersonale !== null && polso.deltaLavoro !== null) {
    const totaleAttuale = polso.istantanea.totale_personale + polso.istantanea.totale_lavoro;
    const deltaTotale = polso.deltaPersonale + polso.deltaLavoro;
    const precedente = totaleAttuale - deltaTotale;
    if (precedente !== 0) deltaPercento = (deltaTotale / Math.abs(precedente)) * 100;
  }

  return Response.json(
    { focus: profilo.focus_del_giorno || null, deltaPercento },
    { headers: { "Cache-Control": "no-store" } }
  );
}
