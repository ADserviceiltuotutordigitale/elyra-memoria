import { constantTimeEqual } from "@/lib/auth";
import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { hashPassword, hashToken } from "@/lib/password";

export async function POST(request) {
  const { token, password } = await request.json().catch(() => ({}));

  if (!password || password.length < 8) {
    return Response.json(
      { ok: false, error: "Password troppo corta." },
      { status: 400 }
    );
  }

  const account = await getAccountAuth();
  if (!account || !account.reset_token_hash || !account.reset_token_scade) {
    return Response.json(
      { ok: false, error: "Link non valido o scaduto." },
      { status: 401 }
    );
  }

  const scaduto = new Date(account.reset_token_scade).getTime() < Date.now();
  const tokenValido = constantTimeEqual(hashToken(String(token ?? "")), account.reset_token_hash);

  if (scaduto || !tokenValido) {
    return Response.json(
      { ok: false, error: "Link non valido o scaduto." },
      { status: 401 }
    );
  }

  await updateAccountAuth({
    password_hash: hashPassword(password),
    reset_token_hash: null,
    reset_token_scade: null,
    reset_richiesto_il: null,
  });

  return Response.json({ ok: true });
}
