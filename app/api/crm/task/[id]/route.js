import { updateTask, deleteTask, trovaOCreaPersona } from "@/lib/store";

const CAMPI_MODIFICABILI = ["titolo", "nota", "fascia", "temperatura", "tag", "scadenza"];

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const patch = {};
  for (const campo of CAMPI_MODIFICABILI) {
    if (campo in body) patch[campo] = body[campo];
  }
  // Il nome della persona arriva come testo dal pannello: risolvi o crea,
  // stessa funzione usata dalla cattura — mai due righe per la stessa persona.
  if ("persona" in body) {
    patch.persona_id = await trovaOCreaPersona(body.persona);
  }

  const task = await updateTask(id, patch);
  return Response.json({ task });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  await deleteTask(id);
  return Response.json({ ok: true });
}
