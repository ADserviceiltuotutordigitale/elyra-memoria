import { eseguiCattura } from "@/lib/capture";

export async function POST(request) {
  const { testo, provenienza = "dashboard" } = await request.json().catch(() => ({}));
  if (!testo || !testo.trim()) {
    return Response.json({ error: "testo mancante" }, { status: 400 });
  }

  const risultato = await eseguiCattura(testo, { provenienza });

  return Response.json({ destinazione: risultato.destinazione });
}
