import { leggiUltimoPolso } from "@/lib/finanze";

export async function GET() {
  const dati = await leggiUltimoPolso();
  return Response.json(dati, { headers: { "Cache-Control": "no-store" } });
}
