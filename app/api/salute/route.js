import { getLogGiornalieroRange } from "@/lib/store";
import { oggiISO } from "@/lib/date";

function trentaGiorniFa(oggi) {
  const [y, m, d] = oggi.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 30);
  return dt.toISOString().slice(0, 10);
}

// Pura aggregazione: nessuna chiamata al modello, nessuna scrittura —
// la scheda più economica delle otto (Parte 5.6).
export async function GET() {
  const oggi = oggiISO();
  const righe = await getLogGiornalieroRange(trentaGiorniFa(oggi), oggi);

  // Un giorno senza pasti registrati è un giorno in cui non hai
  // registrato, non un giorno in cui non hai mangiato: fuori dalla
  // media, altrimenti ogni giorno saltato la abbasserebbe da solo.
  const giorni = righe
    .filter((r) => (r.pasti || []).length > 0)
    .map((r) => {
      const tot = r.pasti.reduce(
        (t, p) => ({
          calorie: t.calorie + (p.calorie || 0),
          proteine: t.proteine + (p.proteine || 0),
          carboidrati: t.carboidrati + (p.carboidrati || 0),
          grassi: t.grassi + (p.grassi || 0),
        }),
        { calorie: 0, proteine: 0, carboidrati: 0, grassi: 0 }
      );
      return { data: r.data, ...tot, numPasti: r.pasti.length, pasti: r.pasti };
    })
    .sort((a, b) => b.data.localeCompare(a.data));

  const n = giorni.length;
  const somma = (campo) => giorni.reduce((t, g) => t + g[campo], 0);
  const medie =
    n === 0
      ? { calorie: 0, proteine: 0, carboidrati: 0, grassi: 0 }
      : {
          calorie: Math.round(somma("calorie") / n),
          proteine: Math.round(somma("proteine") / n),
          carboidrati: Math.round(somma("carboidrati") / n),
          grassi: Math.round(somma("grassi") / n),
        };

  return Response.json(
    { giorni, giorniRegistrati: n, medie },
    { headers: { "Cache-Control": "no-store" } }
  );
}
