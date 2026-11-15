-- APLICAR SOMENTE APÓS HOMOLOGAÇÃO E AUTORIZAÇÃO, COM FLAG OFF.
-- Nenhum dado de jogador é modificado ou migrado; ausência = 'equilibrada'.
CREATE TABLE IF NOT EXISTS pvp_auto_strategy_preferences (
  jid TEXT NOT NULL,
  combatant_id TEXT NOT NULL,
  posture TEXT NOT NULL CHECK(posture IN ('equilibrada','agressiva','defensiva','tatica','adaptativa')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(jid,combatant_id)
);
