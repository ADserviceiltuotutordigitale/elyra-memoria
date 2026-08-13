import { getLogGiornaliero, updateLogGiornaliero } from "@/lib/store";
import { oggiISO } from "@/lib/date";

// Modifica diretta di un macro: le calorie le ha già ricalcolate il
// client con la formula, qui si salva soltanto — nessuna chiamata al
// modello, la formula vince quando esiste (Parte 5.5).
export async function PATCH(request) {
  const { id, proteine, carboidrati, grassi, calorie } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: "id mancante" }, { status: 400 });

  const oggi = oggiISO();
  const log = await getLogGiornaliero(oggi);
  const pasti = log.pasti || [];

  const pastiAggiornati = pasti.map((p) =>
    p.id === id
      ? {
          ...p,
          proteine: proteine ?? p.proteine,
          carboidrati: carboidrati ?? p.carboidrati,
          grassi: grassi ?? p.grassi,
          calorie: calorie ?? p.calorie,
          stimato: false,
        }
      : p
  );
  await updateLogGiornaliero(oggi, { pasti: pastiAggiornati });

  return Response.json({ pasti: pastiAggiornati });
}
