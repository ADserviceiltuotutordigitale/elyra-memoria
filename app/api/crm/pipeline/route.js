import { leggiPipelineOdoo } from "@/lib/odoo";

export async function GET() {
  try {
    const pipeline = await leggiPipelineOdoo();
    return Response.json(pipeline, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
