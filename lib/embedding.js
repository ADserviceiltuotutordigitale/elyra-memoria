import "server-only";

// text-embedding-3-small produce vettori a 1536 dimensioni — la stessa
// misura della colonna vector(1536) nella migrazione (A6). Se cambi
// modello, la dimensione cambia con lui: serve ALTER TABLE e la
// rigenerazione di tutti i vettori esistenti (Parte 3, Appendice B).
const MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

export async function calcolaEmbedding(testo) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: testo }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}
