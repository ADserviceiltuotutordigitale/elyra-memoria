-- Elyra Memoria — A6: tabelle iniziali (Percorso Completo)
-- Applicala incollando questo file nell'SQL Editor del pannello Supabase.
-- Richiede l'estensione "vector" già attiva (Database -> Extensions).

create extension if not exists vector;

-- ============================================================
-- PROFILO — una riga sola, di configurazione
-- ============================================================
create table if not exists profilo (
  user_id text primary key,
  nome text not null default '',
  ruolo text not null default '',
  citta text not null default '',
  focus_del_giorno text not null default '',
  abitudini jsonb not null default '[]'::jsonb,
  obiettivo_calorico_giornaliero integer not null default 2000,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CATTURE — ogni frase che passa dalla barra di cattura o da Telegram
-- ============================================================
create table if not exists catture (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  testo_grezzo text not null,
  provenienza text not null default 'dashboard', -- dashboard | telegram
  destinazione text, -- task | persone | finanze | nutrizione | salute | obiettivi | memoria
  classificazione jsonb, -- output completo del classificatore (titolo, persona, urgenza...)
  via_classificazione text not null default 'modello', -- modello | riserva | regole
  created_at timestamptz not null default now()
);
create index if not exists catture_user_id_idx on catture (user_id, created_at desc);

-- ============================================================
-- PERSONE
-- ============================================================
create table if not exists persone (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  nome text not null,
  organizzazione text,
  tipo text, -- cliente | fornitore | collega | altro
  metadati jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists persone_user_id_idx on persone (user_id);

-- ============================================================
-- TASK — gli elementi del CRM (Parte 5.4)
-- ============================================================
create table if not exists task (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  titolo text not null,
  nota text default '',
  fascia text not null default 'oggi', -- in_ritardo | oggi | settimana | piu_avanti
  temperatura text not null default 'tiepido', -- caldo | tiepido | freddo
  persona_id uuid references persone (id) on delete set null,
  tag jsonb not null default '[]'::jsonb,
  posizione integer not null default 0,
  scadenza date,
  created_at timestamptz not null default now(),
  completato_at timestamptz
);
create index if not exists task_user_id_idx on task (user_id, fascia, posizione);

-- ============================================================
-- LOG GIORNALIERO — una riga per data (Parte 5.3, 5.5, 5.7, 5.8)
-- La riga con data = 2000-01-01 è la sentinella degli Obiettivi:
-- non scade mai, per costruzione. Non è un bug — vedi CLAUDE.md.
-- ============================================================
create table if not exists log_giornaliero (
  user_id text not null,
  data date not null,
  abitudini jsonb not null default '{}'::jsonb,
  pasti jsonb not null default '[]'::jsonb,
  obiettivi jsonb not null default '{}'::jsonb,
  finanze jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, data)
);

-- ============================================================
-- MEMORIA — ogni traccia con il suo embedding
-- ============================================================
create table if not exists memoria (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  testo text not null,
  provenienza text not null default 'cattura', -- cattura | task_completato | diario | ...
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists memoria_user_id_idx on memoria (user_id);
create index if not exists memoria_embedding_hnsw_idx
  on memoria using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- REGISTRO — chi ha fatto cosa e quando
-- ============================================================
create table if not exists registro (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  evento text not null, -- es. "task_completato", "briefing_inviato", "backup_esportato"
  dettagli jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists registro_user_id_idx on registro (user_id, created_at desc);

-- ============================================================
-- RICERCA PER SOMIGLIANZA — A15
-- L'operatore di distanza vettoriale non si esprime con le query
-- normali del client: si chiama via rpc('match_memoria', ...).
-- ============================================================
create or replace function match_memoria(
  query_embedding vector(1536),
  match_user_id text,
  match_count int default 20
)
returns table (
  id uuid,
  testo text,
  provenienza text,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    memoria.id,
    memoria.testo,
    memoria.provenienza,
    memoria.created_at,
    1 - (memoria.embedding <=> query_embedding) as similarity
  from memoria
  where memoria.user_id = match_user_id
    and memoria.embedding is not null
  order by memoria.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- RIGA DI SICUREZZA — protezione a livello di riga, in negazione
-- totale: nessuna policy = nessun accesso per anon/authenticated.
-- Solo la chiave di servizio (che gira sul server, dentro lib/store.js)
-- vede queste tabelle: il ruolo service_role scavalca RLS di suo.
-- ============================================================
alter table profilo enable row level security;
alter table catture enable row level security;
alter table persone enable row level security;
alter table task enable row level security;
alter table log_giornaliero enable row level security;
alter table memoria enable row level security;
alter table registro enable row level security;
