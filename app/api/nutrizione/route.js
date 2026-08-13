import { getProfilo, getLogGiornaliero } from "@/lib/store";
import { oggiISO } from "@/lib/date";

export async function GET() {
  const oggi = oggiISO();
  const [profilo, log] = await Promise.all([getProfilo(), getLogGiornaliero(oggi)]);
  return Response.json(
    { oggi, pasti: log.pasti || [], obiettivoCalorico: profilo.obiettivo_calorico_giornaliero },
    { headers: { "Cache-Control": "no-store" } }
  );
}
