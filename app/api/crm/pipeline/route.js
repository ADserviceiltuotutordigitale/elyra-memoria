import { leggiPipelineOdoo } from "@/lib/odoo";

export async function GET() {
  const pipeline = await leggiPipelineOdoo();
  return Response.json(pipeline, { headers: { "Cache-Control": "no-store" } });
}
