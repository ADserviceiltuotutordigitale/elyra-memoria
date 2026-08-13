import { aggiornaPolsoFinanziario } from "@/lib/finanze";

// Parte solo da qui: un clic tuo, o più avanti il cron notturno. Mai dal
// caricamento di una pagina — è la chiamata più costosa del sistema,
// dentro ci passa il foglio intero (Parte 5.8).
export async function POST() {
  try {
    const istantanea = await aggiornaPolsoFinanziario();
    return Response.json({ istantanea });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
