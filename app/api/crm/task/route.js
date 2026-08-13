import { getTask, addTask, trovaOCreaPersona } from "@/lib/store";

export async function GET() {
  const task = await getTask();
  return Response.json({ task }, { headers: { "Cache-Control": "no-store" } });
}

// Non richiesto esplicitamente dalla guida per il CRM (gli elementi
// arrivano dalla cattura), ma innocuo da avere per completezza futura.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!body.titolo) {
    return Response.json({ error: "titolo mancante" }, { status: 400 });
  }
  const personaId = body.persona ? await trovaOCreaPersona(body.persona) : null;
  const task = await addTask({
    titolo: body.titolo,
    fascia: body.fascia || "oggi",
    temperatura: body.temperatura || "tiepido",
    persona_id: personaId,
  });
  return Response.json({ task });
}
