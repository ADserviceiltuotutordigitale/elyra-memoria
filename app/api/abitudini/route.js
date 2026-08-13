import { getProfilo, getLogGiornaliero, getLogGiornalieroRange, updateLogGiornaliero } from "@/lib/store";
import { oggiISO } from "@/lib/date";

function trentaGiorniFa(oggi) {
  const [y, m, d] = oggi.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 30);
  return dt.toISOString().slice(0, 10);
}

// GET: definizioni delle abitudini + gli ultimi trenta giorni di log, che
// il client fonde con la sua cache in localStorage (Parte 5.3, Completo).
export async function GET() {
  const oggi = oggiISO();
  const profilo = await getProfilo();
  const log = await getLogGiornalieroRange(trentaGiorniFa(oggi), oggi);

  return Response.json(
    { definizioni: profilo.abitudini || [], oggi, log },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST: un solo clic su un'abitudine di oggi. Spunta -> inverte;
// contatore -> incrementa, e se è pieno un altro clic lo azzera (è anche
// il modo più semplice di correggere un clic di troppo).
export async function POST(request) {
  const { chiave } = await request.json().catch(() => ({}));
  if (!chiave) {
    return Response.json({ error: "chiave mancante" }, { status: 400 });
  }

  const profilo = await getProfilo();
  const definizione = (profilo.abitudini || []).find((a) => a.chiave === chiave);
  if (!definizione) {
    return Response.json({ error: "abitudine sconosciuta" }, { status: 400 });
  }

  const oggi = oggiISO();
  const logOggi = await getLogGiornaliero(oggi);
  const attuale = logOggi.abitudini || {};

  const nuovoValore =
    definizione.tipo === "contatore"
      ? (attuale[chiave] || 0) >= definizione.obiettivo
        ? 0
        : (attuale[chiave] || 0) + 1
      : !attuale[chiave];

  const aggiornato = await updateLogGiornaliero(oggi, {
    abitudini: { ...attuale, [chiave]: nuovoValore },
  });

  return Response.json(
    { oggi, abitudini: aggiornato.abitudini },
    { headers: { "Cache-Control": "no-store" } }
  );
}
