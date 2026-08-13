import Anthropic from "@anthropic-ai/sdk";
import { getTask } from "@/lib/store";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

function estraiJson(testo) {
  const inizio = testo.indexOf("{");
  const fine = testo.lastIndexOf("}");
  if (inizio === -1 || fine === -1) return null;
  try {
    return JSON.parse(testo.slice(inizio, fine + 1));
  } catch {
    return null;
  }
}

function filtroTestuale(compatti, domanda) {
  const q = domanda.toLowerCase();
  return compatti
    .filter(
      (c) =>
        c.titolo.toLowerCase().includes(q) ||
        (c.persona || "").toLowerCase().includes(q) ||
        (c.tag || []).some((t) => t.toLowerCase().includes(q))
    )
    .map((c) => c.id);
}

// Ricerca in linguaggio naturale sul CRM (Parte 5.4). La rete di
// sicurezza è la stessa del classificatore: se il modello non risponde
// o la chiave manca, si ripiega su un filtro testuale — la ricerca non
// si rompe mai, al massimo diventa più stupida.
export async function POST(request) {
  const { domanda } = await request.json().catch(() => ({}));
  if (!domanda || !domanda.trim()) {
    return Response.json({ ids: [], via: "regole" });
  }

  const task = await getTask();
  const compatti = task.map((t) => ({
    id: t.id,
    titolo: t.titolo,
    fascia: t.fascia,
    persona: t.persone?.nome || null,
    tag: t.tag || [],
  }));

  if (!anthropic) {
    return Response.json({ ids: filtroTestuale(compatti, domanda), via: "regole" });
  }

  try {
    const risposta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system:
        'Ricevi una domanda e una lista di elementi (identificativo, titolo, fascia, persona, tag). ' +
        'Rispondi SOLO con un oggetto JSON {"ids": [...]} con gli identificativi degli elementi pertinenti alla domanda, nessun altro testo.',
      messages: [
        {
          role: "user",
          content: `Domanda: ${domanda}\n\nElementi: ${JSON.stringify(compatti)}`,
        },
      ],
    });

    const testoRisposta = risposta.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = estraiJson(testoRisposta);
    const idsValidi = Array.isArray(parsed?.ids)
      ? parsed.ids.filter((id) => compatti.some((c) => c.id === id))
      : null;

    if (idsValidi === null) {
      return Response.json({ ids: filtroTestuale(compatti, domanda), via: "regole" });
    }
    return Response.json({ ids: idsValidi, via: "modello" });
  } catch {
    return Response.json({ ids: filtroTestuale(compatti, domanda), via: "regole" });
  }
}
