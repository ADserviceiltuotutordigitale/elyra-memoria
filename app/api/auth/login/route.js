import { cookies } from "next/headers";
import {
  constantTimeEqual,
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { getAccountAuth } from "@/lib/store";
import { verifyPassword } from "@/lib/password";
import { verificaCodice } from "@/lib/totp";

export async function POST(request) {
  const { email, password, codice } = await request.json().catch(() => ({}));

  const account = await getAccountAuth();
  if (!account) {
    return Response.json({ ok: false, error: "Credenziali non valide." }, { status: 401 });
  }

  const emailValida = constantTimeEqual(
    (email ?? "").toLowerCase(),
    account.email.toLowerCase()
  );
  const passwordValida = emailValida && verifyPassword(password ?? "", account.password_hash);
  if (!passwordValida) {
    return Response.json({ ok: false, error: "Credenziali non valide." }, { status: 401 });
  }

  if (account.totp_abilitato && !verificaCodice(account.totp_secret, codice ?? "")) {
    return Response.json({ ok: false, error: "Codice non valido." }, { status: 401 });
  }

  const value = await createSessionCookieValue(process.env.AUTH_SECRET);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return Response.json({ ok: true });
}
