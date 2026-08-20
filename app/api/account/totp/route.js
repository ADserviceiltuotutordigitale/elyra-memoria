import { getAccountAuth } from "@/lib/store";

export async function GET() {
  const account = await getAccountAuth();
  return Response.json({ totpAbilitato: account?.totp_abilitato ?? false });
}
