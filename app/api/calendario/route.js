import { espandiEventi } from "@/lib/ical";

// Cache in memoria sul server per cinque minuti (Parte 5.2): il feed
// contiene l'intero calendario e Google lo rigenera con calma. Attenzione:
// sul Completo la memoria del modulo è per-istanza, quindi è un sollievo
// quando c'è, non una garanzia — ogni tanto il feed viene riscaricato lo
// stesso, ed è per questo che la finestra resta corta.
let cache = null;
const CACHE_MS = 5 * 60 * 1000;

function finestra() {
  const ora = new Date();
  const inizio = new Date(ora);
  inizio.setDate(inizio.getDate() - 7);
  const fine = new Date(ora);
  fine.setDate(fine.getDate() + 14);
  return { inizio, fine };
}

function rispondi(body) {
  // La cache è sul server, non nel browser: la risposta HTTP lo vieta
  // esplicitamente, altrimenti il giorno in cui il calendario "non si
  // aggiorna" non sapresti dove guardare.
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const adesso = Date.now();
  if (cache && adesso - cache.generatoAlle < CACHE_MS) {
    return rispondi(cache);
  }

  const url = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (!url) {
    return rispondi({ eventi: [], generatoAlle: adesso, errore: "calendario non configurato" });
  }

  const res = await fetch(url);
  if (!res.ok) {
    return rispondi({ eventi: [], generatoAlle: adesso, errore: "feed non raggiungibile" });
  }
  const icsText = await res.text();

  const { inizio, fine } = finestra();
  const eventi = espandiEventi(icsText, inizio, fine);

  cache = { eventi, generatoAlle: adesso };
  return rispondi(cache);
}
