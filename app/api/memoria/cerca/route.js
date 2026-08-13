import { calcolaEmbedding } from "@/lib/embedding";
import { searchMemoria } from "@/lib/store";

// L'operatore di distanza vettoriale non si esprime con le query normali
// del client: passa da match_memoria via rpc() (Parte 6, A15).
export async function POST(request) {
  const { domanda } = await request.json().catch(() => ({}));
  if (!domanda || !domanda.trim()) {
    return Response.json({ error: "domanda mancante" }, { status: 400 });
  }

  const embedding = await calcolaEmbedding(domanda);
  if (!embedding) {
    return Response.json({ error: "ricerca non disponibile" }, { status: 503 });
  }

  const risultati = await searchMemoria(embedding, { limit: 20 });
  return Response.json({ risultati }, { headers: { "Cache-Control": "no-store" } });
}
