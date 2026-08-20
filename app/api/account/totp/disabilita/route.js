import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { verifyPassword } from "@/lib/password";

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  const account = await getAccountAuth();
  if (!account || !verifyPassword(password ?? "", account.password_hash)) {
    return Response.json({ ok: false, error: "Password errata." }, { status: 401 });
  }
  await updateAccountAuth({ totp_secret: null, totp_abilitato: false });
  return Response.json({ ok: true });
}
