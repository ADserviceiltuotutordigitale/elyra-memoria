import { leggiStoricoPolso } from "@/lib/finanze";

export async function GET() {
  const storico = await leggiStoricoPolso();
  return Response.json({ storico }, { headers: { "Cache-Control": "no-store" } });
}
