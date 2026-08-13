import { completeTask } from "@/lib/store";

export async function POST(request, { params }) {
  const { id } = await params;
  const task = await completeTask(id);
  return Response.json({ task });
}
