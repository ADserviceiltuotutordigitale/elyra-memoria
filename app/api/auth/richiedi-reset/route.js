import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { generaTokenReset, hashToken } from "@/lib/password";

const FINESTRA_LIMITE_MS = 60 * 1000;
const SCADENZA_MS = 15 * 60 * 1000;

export async function POST(request) {
  const account = await getAccountAuth();
  if (!account) {
    return Response.json({ ok: true });
  }

  const ora = Date.now();
  if (account.reset_richiesto_il) {
    const ultimaRichiesta = new Date(account.reset_richiesto_il).getTime();
    if (ora - ultimaRichiesta < FINESTRA_LIMITE_MS) {
      return Response.json({ ok: true });
    }
  }

  const token = generaTokenReset();

  await updateAccountAuth({
    reset_token_hash: hashToken(token),
    reset_token_scade: new Date(ora + SCADENZA_MS).toISOString(),
    reset_richiesto_il: new Date(ora).toISOString(),
  });

  const origin = new URL(request.url).origin;
  const link = `${origin}/login/reimposta?token=${token}`;

  try {
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_USER_ID,
          text: `Reimposta la password di Elyra (valido 15 minuti):\n${link}`,
        }),
      }
    );
  } catch (err) {
    console.error("[richiedi-reset] invio Telegram fallito", err);
  }

  return Response.json({ ok: true });
}
