import { spostaFaseOpportunita } from "@/lib/odoo";

export async function POST(request, { params }) {
  const { id } = await params;
  const { stageId } = await request.json();
  try {
    const aggiornata = await spostaFaseOpportunita(Number(id), Number(stageId));
    return Response.json(aggiornata);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
