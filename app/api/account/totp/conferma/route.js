import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { verificaCodice } from "@/lib/totp";

export async function POST(request) {
  const { codice } = await request.json().catch(() => ({}));
  const account = await getAccountAuth();
  if (!account?.totp_secret) {
    return Response.json({ ok: false, error: "Nessuna configurazione in corso." }, { status: 400 });
  }
  if (!verificaCodice(account.totp_secret, codice ?? "")) {
    return Response.json({ ok: false, error: "Codice non valido." }, { status: 401 });
  }
  await updateAccountAuth({ totp_secret: account.totp_secret, totp_abilitato: true });
  return Response.json({ ok: true });
}
