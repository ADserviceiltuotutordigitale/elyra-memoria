import { updateTask } from "@/lib/store";

// Riscrive fascia e posizione per tutti gli id della colonna toccata, nel
// nuovo ordine. La versione semplice — poche decine di righe, non
// migliaia — è quella che non si rompe (Parte 5.4).
export async function POST(request) {
  const { fascia, ids } = await request.json().catch(() => ({}));
  if (!fascia || !Array.isArray(ids)) {
    return Response.json({ error: "parametri mancanti" }, { status: 400 });
  }

  await Promise.all(ids.map((id, indice) => updateTask(id, { fascia, posizione: indice })));

  return Response.json({ ok: true });
}
