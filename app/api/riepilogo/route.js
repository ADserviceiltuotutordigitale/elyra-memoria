import { getProfilo } from "@/lib/store";
import { leggiUltimoPolso } from "@/lib/finanze";

// Alimenta la striscia strumenti nella barra in alto (tutte le pagine).
export async function GET() {
  const [profilo, polso] = await Promise.all([getProfilo(), leggiUltimoPolso()]);

  let deltaPercento = null;
  if (polso.istantanea && polso.delta !== null) {
    const precedente = polso.istantanea.patrimonio_netto - polso.delta;
    if (precedente !== 0) deltaPercento = (polso.delta / precedente) * 100;
  }

  return Response.json(
    { focus: profilo.focus_del_giorno || null, deltaPercento },
    { headers: { "Cache-Control": "no-store" } }
  );
}
