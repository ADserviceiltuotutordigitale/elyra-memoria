import { rispondiADomanda } from "@/lib/domande";

export async function POST(request) {
  const { domanda } = await request.json().catch(() => ({}));
  if (!domanda || !domanda.trim()) {
    return Response.json({ error: "domanda mancante" }, { status: 400 });
  }

  try {
    const risultato = await rispondiADomanda(domanda);
    return Response.json(risultato);
  } catch (err) {
    const status = err.message === "risposta non disponibile" ? 503 : 502;
    return Response.json({ error: err.message || "risposta non riuscita, riprova" }, { status });
  }
}
