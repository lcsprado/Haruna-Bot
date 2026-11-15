-- PROTÓTIPO PvP Estratégico: NÃO EXECUTAR NA PRODUÇÃO.
-- Banco isolado de homologação. Nenhuma alteração em stats, XP, inventário ou carteira.
CREATE TABLE IF NOT EXISTS pvp_duel_sessions (
  id TEXT PRIMARY KEY,
  player_a TEXT NOT NULL,
  player_b TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('invited','ready','decision','combat','finished','cancelled')),
  revision INTEGER NOT NULL CHECK(revision>=0),
  state JSONB NOT NULL CHECK(jsonb_typeof(state)='object'),
  next_deadline_at TIMESTAMPTZ,
  hard_expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pvp_duel_distinct_players CHECK(player_a<>player_b)
);
CREATE INDEX IF NOT EXISTS pvp_duel_due_idx
 ON pvp_duel_sessions(next_deadline_at)
 WHERE next_deadline_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS pvp_duel_hard_expiry_idx
 ON pvp_duel_sessions(hard_expires_at)
 WHERE phase NOT IN ('finished','cancelled');
-- A mesma pessoa nunca pode estar em 2 sessões ativas, como host OU convidado.
CREATE TABLE IF NOT EXISTS pvp_duel_participants (
  jid TEXT PRIMARY KEY,
  duel_id TEXT NOT NULL REFERENCES pvp_duel_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS pvp_duel_participants_duel_idx
 ON pvp_duel_participants(duel_id);
-- Eventos de retomada e notificação persistentes; deduplicação por revisão.
CREATE TABLE IF NOT EXISTS pvp_duel_outbox (
  event_id BIGSERIAL PRIMARY KEY,
  duel_id TEXT NOT NULL REFERENCES pvp_duel_sessions(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('invited','accepted','declined','decision_opened','choice_recorded','round_resolved','finished','expired')),
  payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (duel_id,revision,kind)
);
CREATE INDEX IF NOT EXISTS pvp_duel_outbox_pending_idx
 ON pvp_duel_outbox(event_id) WHERE delivered_at IS NULL;
