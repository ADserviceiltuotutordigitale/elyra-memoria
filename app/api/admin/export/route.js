import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "@/lib/auth";
import { esportaTutto } from "@/lib/store";

const VERSIONE_SCHEMA = 1;

// Qui l'intestazione x-api-secret non vale, e va rifiutata
// esplicitamente: è la rotta che restituisce tutto il database, e la
// porta di servizio per gli script non ci entra (Parte 7.6, A19).
// Il middleware in proxy.js lascerebbe passare anche x-api-secret su
// /api/*, quindi la sessione si riverifica qui, da capo.
export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessioneValida = await verifySessionCookieValue(sessionCookie, process.env.AUTH_SECRET);

  if (!sessioneValida) {
    return Response.json({ error: "serve una sessione valida (non basta il segreto API)" }, { status: 401 });
  }

  const dati = await esportaTutto();
  const corpo = JSON.stringify(
    {
      generato_alle: new Date().toISOString(),
      versione_schema: VERSIONE_SCHEMA,
      ...dati,
    },
    null,
    2
  );

  const nomeFile = `elyra-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(corpo, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${nomeFile}"`,
      "Cache-Control": "no-store",
    },
  });
}
