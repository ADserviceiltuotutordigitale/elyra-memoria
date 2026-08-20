alter table account_auth
  add column reset_token_hash text,
  add column reset_token_scade timestamptz,
  add column reset_richiesto_il timestamptz;
