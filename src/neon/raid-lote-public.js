// Visualização pública da economia fictícia do Raid Lote.
// Apenas SELECT: nunca executa compra, inicia combate ou cancela pacote.
const safeName=value=>String(value||'Jogador').replace(/[\r\n*_`~]/g,' ').trim().slice(0,42)||'Jogador'
const integer=value=>Math.max(0,Math.floor(Number(value)||0))
const percent=(value,max)=>max>0?Math.max(0,Math.min(100,Math.round(100*value/max))):null
const publicStatus={queued:'AGUARDANDO',running:'EM ANDAMENTO',won:'CONCLUÍDO',lost:'DERROTA',cancelled:'CANCELADO',failed:'FALHA'} 

export async function getRaidLotePublicBoard(db,limit=12){
  const n=Math.max(1,Math.min(15,integer(limit)||12))
  const {rows}=await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (j.jid)
        j.id,j.jid,j.level,j.requested,j.started,j.won_count,
        j.status,j.current_attempt_id,j.created_at,j.finished_at
      FROM raid_lote_jobs j
      WHERE j.status IN ('queued','running')
        OR (j.finished_at>=NOW()-INTERVAL '24 hours')
      ORDER BY j.jid,
        CASE WHEN j.status IN ('queued','running') THEN 0 ELSE 1 END,
        j.created_at DESC
    )
    SELECT l.*,COALESCE(NULLIF(u.push_name,''),'Jogador') AS player_name,
      a.seq AS attempt_seq,a.status AS attempt_status,
      g.state->>'status' AS battle_status,
      g.state->>'round' AS battle_round,
      g.state->>'hp' AS boss_hp,
      g.state->>'maxHp' AS boss_max_hp,
      g.state->>'lastRoundAt' AS last_round_at,
      earned.xp AS earned_xp,earned.pet_xp AS earned_pet_xp,
      earned.fragments AS earned_fragments,earned.cash AS earned_cash
    FROM latest l
    LEFT JOIN users u ON u.jid=l.jid
    LEFT JOIN raid_lote_attempts a ON a.id=l.current_attempt_id
    LEFT JOIN trevo_games g ON g.chat_jid=a.raid_chat AND g.game_type=('raid:'||l.level::text)
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM((rw.v->>'exp')::bigint),0) AS xp,
        COALESCE(SUM((rw.v->>'petXp')::bigint),0) AS pet_xp,
        COALESCE(SUM((rw.v->'material'->>'qty')::bigint),0) AS fragments,
        COALESCE(SUM((rw.v->>'cash')::bigint),0) AS cash
      FROM raid_lote_attempts won
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(won.reward_summary->'rewards','[]'::jsonb)) AS rw(v)
      WHERE won.job_id=l.id AND won.status='won'
    ) earned ON true
    ORDER BY CASE WHEN l.status IN ('queued','running') THEN 0 ELSE 1 END,
      l.created_at DESC
    LIMIT $1
  `,[n])
  return rows
}

export async function getRaidLoteCurrentProgress(db,job){
  if(!job?.id||!job?.current_attempt_id)return null
  const {rows}=await db.query(`
    SELECT a.seq AS attempt_seq,a.status AS attempt_status,
      g.state->>'status' AS battle_status,
      g.state->>'round' AS battle_round,
      g.state->>'hp' AS boss_hp,
      g.state->>'maxHp' AS boss_max_hp,
      g.state->>'lastRoundAt' AS last_round_at
    FROM raid_lote_attempts a
    LEFT JOIN trevo_games g ON g.chat_jid=a.raid_chat AND g.game_type=('raid:'||a.level::text)
    WHERE a.id=$1 AND a.job_id=$2
  `,[job.current_attempt_id,job.id])
  return rows[0]||null
}

export function formatRaidLoteProgress(row,nowMs=Date.now()){
  if(!row?.attempt_seq)return ''
  const parts=['⚔️ Tentativa atual: '+integer(row.attempt_seq)]
  if(row.battle_status==='active'){
    parts.push('🔄 Rodada: '+integer(row.battle_round))
    const hp=Number(row.boss_hp),max=Number(row.boss_max_hp)
    if(Number.isFinite(hp)&&Number.isFinite(max)&&max>0){
      parts.push('❤️ Boss: '+integer(hp).toLocaleString('pt-BR')+'/'+integer(max).toLocaleString('pt-BR')+' ('+percent(hp,max)+'%)')
    }
    const last=Number(row.last_round_at||0)
    if(last>0&&nowMs>=last){
      const seconds=Math.floor((nowMs-last)/1000)
      parts.push('🕒 Última rodada há '+seconds+'s'+(seconds>=90?' ⚠️ sem avanço recente':''))
    }else parts.push('🕒 Preparando primeira rodada')
  }else if(row.battle_status==='completed')parts.push('✅ Batalha concluída; liquidando recompensa')
  else if(row.battle_status==='failed')parts.push('💀 Batalha encerrada; liquidando derrota')
  else parts.push('⌛ Aguardando início ou sincronização')
  return parts.join('\n')
}

export function formatRaidLotePublicBoard(rows,nowMs=Date.now()){
  if(!Array.isArray(rows)||rows.length===0)
    return '⚔️ *RAIDLOTE — PAINEL*\nNenhum pacote em andamento ou concluído nas últimas 24 horas.'
  const out=rows.map((row,i)=>{
    const status=publicStatus[row.status]||'INDEFINIDO'
    const lines=[(i+1)+'. *'+safeName(row.player_name)+'* • Lv.'+integer(row.level)+' • '+status,
      '🏆 '+integer(row.won_count)+'/'+integer(row.requested)+' vitórias • '+integer(row.started)+' iniciada(s)']
    if(integer(row.won_count)>0){
      lines.push('✨ XP +'+integer(row.earned_xp).toLocaleString('pt-BR')+
        ' • 🧩 Frag +'+integer(row.earned_fragments).toLocaleString('pt-BR')+
        ' • 🐾 Pet XP +'+integer(row.earned_pet_xp).toLocaleString('pt-BR'))
    }
    if(row.status==='running'||row.status==='queued'){
      const detail=formatRaidLoteProgress(row,nowMs)
      if(detail)lines.push(detail)
    }
    return lines.join('\n')
  })
  return '⚔️ *RAIDLOTE — PAINEL DOS JOGADORES*\n'+
    'Pacotes ativos e os encerrados nas últimas 24h.\n\n'+out.join('\n\n')+
    '\n\n🔄 Atualize com *!raidlote painel*'
}
