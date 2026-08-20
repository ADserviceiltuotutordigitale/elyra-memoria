import QRCode from "qrcode";
import { getAccountAuth, updateAccountAuth } from "@/lib/store";
import { generaSegreto, generaOtpauthUri } from "@/lib/totp";

export async function POST() {
  const account = await getAccountAuth();
  if (!account) {
    return Response.json({ error: "Nessun account configurato." }, { status: 400 });
  }
  const segreto = generaSegreto();
  await updateAccountAuth({ totp_secret: segreto, totp_abilitato: false });
  const uri = generaOtpauthUri(segreto, account.email);
  const qrDataUri = await QRCode.toDataURL(uri);
  return Response.json({ segreto, qrDataUri });
}
