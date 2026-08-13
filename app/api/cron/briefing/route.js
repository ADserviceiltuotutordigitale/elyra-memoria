import { generaEInviaBriefing } from "@/lib/briefing";

// L'orario del cron in vercel.json ("0 5 * * *") è in UTC, sempre: sono
// le 6 del mattino in Italia d'inverno, le 7 d'estate. Non si può dire
// "le 7 ora italiana" — o va bene un orario fisso tutto l'anno, o due
// volte l'anno si cambia una cifra a mano (Parte 7.5).

// Vercel chiama questa rotta via GET con Authorization: Bearer CRON_SECRET
// impostato automaticamente (Parte 7.5). Fuori da lì è un pulsante
// pubblico che consuma budget — per questo si verifica sempre per primo.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("non autorizzato", { status: 401 });
  }

  try {
    const risultato = await generaEInviaBriefing();
    return Response.json(risultato);
  } catch (err) {
    console.error("[cron briefing]", err);
    // Risponde comunque 200 con l'errore nel corpo: è un cron, non una
    // rotta utente, e Vercel non deve interpretarlo come un fallimento
    // da segnalare in modo rumoroso (Parte 7.5).
    return Response.json({ inviato: false, errore: err.message });
  }
}
