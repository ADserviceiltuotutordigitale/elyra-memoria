import "server-only";
import { createClient } from "@supabase/supabase-js";

// Unico punto di accesso ai dati (Parte 1.3). Nessuna rotta o componente
// tocca Supabase direttamente: tutti passano da qui. L'import "server-only"
// rompe la build se questo file finisce in un bundle client per errore.

// Solo chiave di servizio, mai sessioni utente: niente autorefresh né
// persistenza, altrimenti il client tenta in background un refresh di
// una sessione che non esiste.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const USER_ID = process.env.USER_ID || "default";

function orThrow(error, context) {
  if (error) throw new Error(`[store] ${context}: ${error.message}`);
}

// ---------------------------------------------------------------
// Profilo — una riga sola, di configurazione
// ---------------------------------------------------------------

export async function getProfilo() {
  const { data, error } = await supabase
    .from("profilo")
    .select("*")
    .eq("user_id", USER_ID)
    .maybeSingle();
  orThrow(error, "getProfilo");
  if (data) return data;

  // Prima apertura: nasce una riga profilo vuota, come il seed del Locale.
  const { data: created, error: createError } = await supabase
    .from("profilo")
    .insert({ user_id: USER_ID })
    .select("*")
    .single();
  orThrow(createError, "getProfilo (creazione riga iniziale)");
  return created;
}

export async function updateProfilo(patch) {
  const { data, error } = await supabase
    .from("profilo")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", USER_ID)
    .select("*")
    .single();
  orThrow(error, "updateProfilo");
  return data;
}

// ---------------------------------------------------------------
// Catture
// ---------------------------------------------------------------

export async function getCatture({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from("catture")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(limit);
  orThrow(error, "getCatture");
  return data;
}

export async function addCattura({
  testoGrezzo,
  provenienza = "dashboard",
  destinazione = null,
  classificazione = null,
  viaClassificazione = "modello",
}) {
  const { data, error } = await supabase
    .from("catture")
    .insert({
      user_id: USER_ID,
      testo_grezzo: testoGrezzo,
      provenienza,
      destinazione,
      classificazione,
      via_classificazione: viaClassificazione,
    })
    .select("*")
    .single();
  orThrow(error, "addCattura");
  return data;
}

// ---------------------------------------------------------------
// Task (CRM — Parte 5.4)
// ---------------------------------------------------------------

export async function getTask({ fascia } = {}) {
  let query = supabase
    .from("task")
    .select("*, persone(id, nome)")
    .eq("user_id", USER_ID)
    .is("completato_at", null)
    .order("fascia", { ascending: true })
    .order("posizione", { ascending: true });
  if (fascia) query = query.eq("fascia", fascia);
  const { data, error } = await query;
  orThrow(error, "getTask");
  return data;
}

export async function addTask(task) {
  const { data, error } = await supabase
    .from("task")
    .insert({ ...task, user_id: USER_ID })
    .select("*")
    .single();
  orThrow(error, "addTask");
  return data;
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase
    .from("task")
    .update(patch)
    .eq("id", id)
    .eq("user_id", USER_ID)
    .select("*")
    .single();
  orThrow(error, "updateTask");
  return data;
}

// Completare non cancella (Parte 5.4): resta nei dati con la data di
// completamento. La cancellazione vera è deleteTask, un gesto separato.
export async function completeTask(id) {
  return updateTask(id, { completato_at: new Date().toISOString() });
}

export async function deleteTask(id) {
  const { error } = await supabase
    .from("task")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);
  orThrow(error, "deleteTask");
}

// ---------------------------------------------------------------
// Persone
// ---------------------------------------------------------------

export async function getPersone() {
  const { data, error } = await supabase
    .from("persone")
    .select("*")
    .eq("user_id", USER_ID)
    .order("nome", { ascending: true });
  orThrow(error, "getPersone");
  return data;
}

export async function addPersona(persona) {
  const { data, error } = await supabase
    .from("persone")
    .insert({ ...persona, user_id: USER_ID })
    .select("*")
    .single();
  orThrow(error, "addPersona");
  return data;
}

export async function updatePersona(id, patch) {
  const { data, error } = await supabase
    .from("persone")
    .update(patch)
    .eq("id", id)
    .eq("user_id", USER_ID)
    .select("*")
    .single();
  orThrow(error, "updatePersona");
  return data;
}

// ---------------------------------------------------------------
// Memoria — scrittura e ricerca per somiglianza (A15)
// ---------------------------------------------------------------

export async function addMemoria({ testo, provenienza = "cattura", embedding = null }) {
  const { data, error } = await supabase
    .from("memoria")
    .insert({ user_id: USER_ID, testo, provenienza, embedding })
    .select("*")
    .single();
  orThrow(error, "addMemoria");
  return data;
}

// L'operatore di distanza vettoriale non si esprime con le query normali
// del client: passa sempre da qui, che chiama match_memoria via rpc().
export async function searchMemoria(embedding, { limit = 20 } = {}) {
  const { data, error } = await supabase.rpc("match_memoria", {
    query_embedding: embedding,
    match_user_id: USER_ID,
    match_count: limit,
  });
  orThrow(error, "searchMemoria");
  return data;
}

// ---------------------------------------------------------------
// Registro
// ---------------------------------------------------------------

export async function getRegistro({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from("registro")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(limit);
  orThrow(error, "getRegistro");
  return data;
}

export async function addRegistro({ evento, dettagli = {} }) {
  const { data, error } = await supabase
    .from("registro")
    .insert({ user_id: USER_ID, evento, dettagli })
    .select("*")
    .single();
  orThrow(error, "addRegistro");
  return data;
}

// ---------------------------------------------------------------
// Log giornaliero — una riga per data (Parte 5.3, 5.5, 5.7, 5.8)
// ---------------------------------------------------------------

const LOG_VUOTO = { abitudini: {}, pasti: [], obiettivi: {}, finanze: {} };

export async function getLogGiornaliero(data) {
  const { data: row, error } = await supabase
    .from("log_giornaliero")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("data", data)
    .maybeSingle();
  orThrow(error, "getLogGiornaliero");
  return row ?? { user_id: USER_ID, data, ...LOG_VUOTO };
}

// Crea la riga se non esiste (upsert). `patch` sovrascrive solo le chiavi
// di primo livello che passi (abitudini/pasti/obiettivi/finanze) — per
// aggiornare un singolo campo dentro un JSON leggi prima con
// getLogGiornaliero e ricomponi l'oggetto intero.
export async function updateLogGiornaliero(data, patch) {
  const attuale = await getLogGiornaliero(data);
  const { data: row, error } = await supabase
    .from("log_giornaliero")
    .upsert(
      {
        user_id: USER_ID,
        data,
        abitudini: patch.abitudini ?? attuale.abitudini,
        pasti: patch.pasti ?? attuale.pasti,
        obiettivi: patch.obiettivi ?? attuale.obiettivi,
        finanze: patch.finanze ?? attuale.finanze,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,data" }
    )
    .select("*")
    .single();
  orThrow(error, "updateLogGiornaliero");
  return row;
}

export async function getLogGiornalieroRange(dataInizio, dataFine) {
  const { data, error } = await supabase
    .from("log_giornaliero")
    .select("*")
    .eq("user_id", USER_ID)
    .gte("data", dataInizio)
    .lte("data", dataFine)
    .order("data", { ascending: true });
  orThrow(error, "getLogGiornalieroRange");
  return data;
}
