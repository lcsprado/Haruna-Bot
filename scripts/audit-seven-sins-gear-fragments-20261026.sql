-- AUDITORIA SOMENTE LEITURA (26/10/2026)
-- Executar EXCLUSIVAMENTE no banco confirmado como ativo para o WhatsApp.
-- O antigo Neon pode nao conter o historico mais recente da Aiven.
-- Nao executar reembolso com base em snapshots/cópias de testes.

SELECT
  current_database() AS database_name,
  t.from_jid AS jogador_jid,
  COUNT(*)::int AS evolucoes_pagas_com_fragmentos,
  COALESCE(SUM(t.amount),0)::bigint AS fragmentos_gastos,
  MIN(to_timestamp(t.created_at)) AS primeiro_gasto,
  MAX(to_timestamp(t.created_at)) AS ultimo_gasto,
  COALESCE(inv.quantity,0)::int AS fragmentos_atuais
FROM transactions t
LEFT JOIN inventories inv
  ON inv.jid=t.from_jid
  AND inv.item_id='fragmento_ascensao_pecados_20261024'
WHERE t.type='equipment_upgrade_collab_fragments'
  AND t.amount>0
GROUP BY t.from_jid,inv.quantity
ORDER BY fragmentos_gastos DESC,jogador_jid;

-- Antes de qualquer compensacao, procurar creditos manuais ja concedidos,
-- verificar o ambiente, os jogadores afetados e a ausencia de marcador
-- 'refund_collab_gear_fragments_20261026:<jid>'.
-- Os upgrades ficam preservados, nenhum nivel e revertido pelo ajuste do código.
-- Este arquivo nao escreve no banco.
