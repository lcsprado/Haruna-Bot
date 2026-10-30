// Reconstrução pontual do resultado semanal de 30/10/2026.
// Os quatro pagamentos já existem no extrato. Esta rotina é SOMENTE LEITURA:
// não atualiza saldos, EXP, inventários, Boss nem classificações históricas.
const money=n=>Math.round(Number(n)||0).toLocaleString('pt-BR')
const nameSafe=n=>String(n||'Jogador').replace(/[\r\n\t*_~`]/g,' ').trim().slice(0,55)||'Jogador'
const edition='2026-10-30'
const start=Math.floor(Date.parse('2026-10-30T12:30:00-03:00')/1000)
const end=Math.floor(Date.parse('2026-10-30T12:45:00-03:00')/1000)
const tiers=[
  {epic:15,legendary:3,insignia:'insignia_semanal_20261030_campeao',label:'Campeão'},
  {epic:12,legendary:2,insignia:'insignia_semanal_20261030_guardiao',label:'Guardião'},
  {epic:9,legendary:1,insignia:'insignia_semanal_20261030_guardiao',label:'Guardião'},
  {epic:7,legendary:0,insignia:'insignia_semanal_20261030_guardiao',label:'Guardião'}
]
export function isUnarchivedWeeklyBoss20261030(state){
  return state?.mode==='completed'&&state?.weeklyCompleted===true&&
    state.weekendKey===edition&&Number(state.hp)===0&&
    Number(state.maxHp)===8210620&&
    !Array.isArray(state.result?.rewards)
}
export function formatBossArchive20261030(state,awards,stocks=[]){
  if(!isUnarchivedWeeklyBoss20261030(state)||!Array.isArray(awards)||awards.length!==4) return []
  const ordered=[...awards].sort((a,b)=>Number(b.cash)-Number(a.cash))
  if(new Set(ordered.map(r=>String(r.jid))).size!==4 ||
     ordered.reduce((sum,r)=>sum+Number(r.cash||0),0)!==14169999) return []
  const inv=new Map(stocks.map(r=>[String(r.jid)+'|'+String(r.item_id),Number(r.quantity||0)]))
  let message='🏆 *GOLEM ANCESTRAL DERROTADO — RESULTADO OFICIAL 30/10*\n\n'+
    '❤️ HP eliminado: *8.210.620*\n'+
    '⏰ Vitória confirmada: *12h37 (Brasília)*\n\n'+
    '🏅 *CLASSIFICAÇÃO E PRÊMIOS*'
  for(let i=0;i<ordered.length;i++){
    const p=ordered[i],tier=tiers[i],medal=['🥇','🥈','🥉','🏅'][i]
    const epics=inv.get(String(p.jid)+'|caixa_epica')
    const legends=inv.get(String(p.jid)+'|caixa_lendaria')
    const insignia=inv.get(String(p.jid)+'|'+tier.insignia)
    let expected='🎁 '+tier.epic+' Caixas Épicas'+
      (tier.legendary?' + '+tier.legendary+' Caixas Lendárias':'')+
      ' • Insígnia '+tier.label
    const review=(epics!==undefined&&epics<tier.epic)||
      (tier.legendary>0&&legends!==undefined&&legends<tier.legendary)||
      (insignia!==undefined&&insignia<1)
    message+='\n\n'+medal+' *'+(i+1)+'º '+nameSafe(p.name)+'*'+
      '\n💰 R$ '+money(p.cash)+' — *crédito confirmado*'+
      '\n'+expected+
      (review?'\n⚠️ Quantidade atual insuficiente para confirmar todas as caixas; requer conferência individual.':'')
  }
  message+='\n\n✨ *EXP e drops aleatórios:* foram processados na liquidação, mas o registro antigo não salvou o detalhamento individual. Não é possível informar números exatos retroativamente.\n\n'+
    '✅ Os valores acima constam do extrato do jogo. As caixas e insígnias são os prêmios garantidos por colocação, sujeitos a uso posterior pelo jogador. *Nenhum saldo ou item foi duplicado.*\n'+
    '📌 Aviso recuperado após falha de comunicação do WhatsApp.'
  return [message]
}
export async function loadBossArchive20261030(db,state){
  if(!isUnarchivedWeeklyBoss20261030(state)) return []
  const tx=await db.query(`
    SELECT t.to_jid AS jid,t.amount AS cash,
      COALESCE(NULLIF(u.push_name,''),'Jogador') AS name
    FROM transactions t LEFT JOIN users u ON u.jid=t.to_jid
    WHERE t.note='boss_weekend' AND t.created_at BETWEEN $1 AND $2
    ORDER BY t.amount DESC,t.id
  `,[start,end])
  if(tx.rows.length!==4) return []
  const jids=tx.rows.map(p=>p.jid)
  const inventory=await db.query(`
    SELECT jid,item_id,quantity FROM inventories
    WHERE jid=ANY($1::text[]) AND
      (item_id IN ('caixa_epica','caixa_lendaria') OR item_id LIKE 'insignia_semanal_20261030%')
  `,[jids])
  return formatBossArchive20261030(state,tx.rows,inventory.rows)
}
