import { getLogGiornaliero, updateLogGiornaliero } from "@/lib/store";

// Riga sentinella (vedi CLAUDE.md): gli obiettivi non si azzerano mai da
// soli, quindi non vivono sulla riga di oggi ma su una data fissa che
// nessun cambio di settimana o di mese può far scadere (Parte 5.7).
const DATA_SENTINELLA = "2000-01-01";

function normalizza(obiettivi) {
  return {
    settimana: Array.isArray(obiettivi?.settimana) ? obiettivi.settimana : [],
    mese: Array.isArray(obiettivi?.mese) ? obiettivi.mese : [],
  };
}

export async function GET() {
  const log = await getLogGiornaliero(DATA_SENTINELLA);
  return Response.json(normalizza(log.obiettivi), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const { sezione, testo } = await request.json().catch(() => ({}));
  if (sezione !== "settimana" && sezione !== "mese") {
    return Response.json({ error: "sezione non valida" }, { status: 400 });
  }
  if (!testo || !testo.trim()) {
    return Response.json({ error: "testo mancante" }, { status: 400 });
  }

  const log = await getLogGiornaliero(DATA_SENTINELLA);
  const obiettivi = normalizza(log.obiettivi);
  obiettivi[sezione] = [
    ...obiettivi[sezione],
    { id: crypto.randomUUID(), testo: testo.trim(), fatto: false },
  ];
  await updateLogGiornaliero(DATA_SENTINELLA, { obiettivi });

  return Response.json(obiettivi);
}

export async function PATCH(request) {
  const { sezione, id, patch } = await request.json().catch(() => ({}));
  if ((sezione !== "settimana" && sezione !== "mese") || !id) {
    return Response.json({ error: "parametri mancanti" }, { status: 400 });
  }

  const log = await getLogGiornaliero(DATA_SENTINELLA);
  const obiettivi = normalizza(log.obiettivi);
  obiettivi[sezione] = obiettivi[sezione].map((o) => (o.id === id ? { ...o, ...patch } : o));
  await updateLogGiornaliero(DATA_SENTINELLA, { obiettivi });

  return Response.json(obiettivi);
}

export async function DELETE(request) {
  const { sezione, id } = await request.json().catch(() => ({}));
  if ((sezione !== "settimana" && sezione !== "mese") || !id) {
    return Response.json({ error: "parametri mancanti" }, { status: 400 });
  }

  const log = await getLogGiornaliero(DATA_SENTINELLA);
  const obiettivi = normalizza(log.obiettivi);
  obiettivi[sezione] = obiettivi[sezione].filter((o) => o.id !== id);
  await updateLogGiornaliero(DATA_SENTINELLA, { obiettivi });

  return Response.json(obiettivi);
}
