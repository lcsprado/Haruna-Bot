-- PROTOTIPO / NÃO EXECUTAR EM PRODUÇÃO. Aprovação separada necessária.
-- Cada postura pertence ao jogador e ao herói/classe, sem modificar atributos ou XP.
CREATE TABLE IF NOT EXISTS pvp_strategy_preferences (
  jid TEXT NOT NULL,
  combatant_id TEXT NOT NULL,
  posture TEXT NOT NULL CHECK(posture IN ('equilibrada','agressiva','defensiva','tatica')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(jid, combatant_id)
);
-- Sem backfill necessário: ausentes usam postura 'equilibrada'.
