import {db,ensureUser,petMaxHp,petMaxEnergy} from './db.js'
import {COLLAB_FRAGMENT_ITEM,COLLAB_RAID_FRAGMENTS_PER_WIN,COLLAB_RAID_DAILY_CAP,collabRaidBrazilDay} from './collab-fragment-rules.js'
import {PECADOS_ESSENCES,PECADOS_HEROES,PECADOS_WEAPONS,PECADOS_ARMORS,PECADOS_GEAR_IDS,PECADOS_EDITIONS} from './sete-pecados-catalog.js'

const fmt=n=>Number(n||0).toLocaleString('pt-BR')
const KEY_PREFIX='sete-pecados-retro-20261019:'
const BOX_MESSAGE_PREFIX='sete-pecados-box-message:'

const BONUS_STYLE={predador:'🐾 Predador',guardiao:'🛡️ Guardião',mistico:'✨ Místico',voador:'🪽 Voador'}
const pct=value=>Number(value*100).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'
function collabGearBonus(item){
 const values=[]
 if(item.atk)values.push('⚔️ +'+fmt(item.atk)+' ATK')
 if(item.def)values.push('🛡️ +'+fmt(item.def)+' DEF')
 if(item.hp)values.push('❤️ +'+fmt(item.hp)+' HP')
 if(item.spd)values.push('💨 +'+fmt(item.spd)+' VEL')
 if(item.crit)values.push('🎯 +'+pct(item.crit)+' CRIT')
 return values.join(' • ')
}
function collabHeroBonus(hero){
 const s=hero.stats||{}
 const values=[]
 if(s.damage)values.push('⚔️ +'+s.damage+'% dano')
 if(s.bossDamage)values.push('👹 +'+s.bossDamage+'% dano Boss')
 if(s.defense)values.push('🛡️ +'+s.defense+'% defesa')
 if(s.crit)values.push('🎯 +'+s.crit+'% CRIT')
 if(s.dodge)values.push('💨 +'+s.dodge+'% esquiva')
 if(s.drop)values.push('🎁 +'+s.drop+'% drop')
 return values.join(' • ')
}

async function inTransaction(fn){
 const c=await db.connect()
 try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}
 catch(e){await c.query('ROLLBACK');throw e}
 finally{c.release()}
}
async function legacyReward(c,jid){
 const key=KEY_PREFIX+jid
 // Registra a compensação apenas quando existe evidência histórica no Neon.
 const known=(await c.query("SELECT 1 FROM trevo_settings WHERE key=$1 FOR UPDATE",[key])).rows[0]
 if(known)return {already:true,quantity:0}
 const events=(await c.query(`SELECT
    COUNT(DISTINCT (to_timestamp(created_at) AT TIME ZONE 'America/Sao_Paulo')::date)::int AS days,
    BOOL_OR(note='boss_event_sete_pecados_insignia_repetida') AS repeated
   FROM transactions WHERE to_jid=$1 AND type='minigame'
   AND note LIKE 'boss_event_sete_pecados%'
   AND created_at>=EXTRACT(EPOCH FROM TIMESTAMPTZ '2026-10-11 00:00:00-03')::bigint
   AND created_at<EXTRACT(EPOCH FROM TIMESTAMPTZ '2026-10-19 00:00:00-03')::bigint`,[jid])).rows[0]
 const legacy=(await c.query("SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventories WHERE jid=$1 AND (item_id=ANY($2::text[]) OR item_id IN ('insignia_sete_pecados','titulo_conquistador_pecados'))",[jid,PECADOS_ESSENCES])).rows[0]
 const days=Number(events?.days||0),hasEvidence=Boolean(events?.repeated)||days>0||Number(legacy?.qty||0)>0
 if(!hasEvidence)return {already:false,quantity:0,unverified:true}
 const quantity=events?.repeated||days>=2?7:3
 const saved=await c.query("INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING key",[key,JSON.stringify({quantity,days,repeated:Boolean(events?.repeated),at:Date.now(),source:'historical-evidence'})])
 if(!saved.rowCount)return {already:true,quantity:0}
 await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity",[jid,PECADOS_ESSENCES[0],quantity])
 return {already:false,quantity,days}
}
export async function openBox(jid,requestId=null){
 return inTransaction(async c=>{
  await c.query("SELECT jid FROM users WHERE jid=$1 FOR UPDATE",[jid])
  // A chave deriva da mensagem original do WhatsApp. Toda recompensa e seu
  // marcador são confirmados na MESMA transação. Replay não consome essências.
  const markerKey=requestId?BOX_MESSAGE_PREFIX+jid+':'+requestId:null
  if(markerKey){
    const claimed=await c.query(
      "INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(key) DO NOTHING RETURNING key",
      [markerKey,JSON.stringify({status:'processing'})]
    )
    if(!claimed.rowCount){
      const previous=(await c.query("SELECT value FROM trevo_settings WHERE key=$1",[markerKey])).rows[0]?.value
      return previous?.result?{...previous.result,replay:true}:{replay:true,unknown:true}
    }
  }
  async function finish(result){
    if(markerKey){
      await c.query(
        "UPDATE trevo_settings SET value=$2::jsonb,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE key=$1",
        [markerKey,JSON.stringify({result,processedAt:Date.now()})]
      )
    }
    return result
  }
  const rows=(await c.query("SELECT item_id,quantity FROM inventories WHERE jid=$1 AND item_id=ANY($2::text[]) ORDER BY item_id FOR UPDATE",[jid,PECADOS_ESSENCES])).rows
  const owned=rows.reduce((n,r)=>n+Number(r.quantity||0),0)
  if(owned<7)return finish({insufficient:true,owned})
  let remaining=7
  for(const row of rows){
    if(!remaining)break
    const use=Math.min(remaining,Number(row.quantity||0))
    if(use)await c.query("UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3",[use,jid,row.item_id])
    remaining-=use
  }
  const categories=['personagem','arma','armadura']
  const category=categories[Math.floor(Math.random()*3)]
  const pool=category==='personagem'?PECADOS_HEROES:category==='arma'?PECADOS_WEAPONS:PECADOS_ARMORS
  const reward=pool[Math.floor(Math.random()*pool.length)]
  const itemId=category==='personagem'?reward.species:reward.id
  const duplicate=category==='personagem'
    ?Boolean((await c.query("SELECT id FROM pet_collection WHERE jid=$1 AND species=$2 LIMIT 1",[jid,itemId])).rowCount)
    :Boolean((await c.query("SELECT 1 FROM inventories WHERE jid=$1 AND item_id=$2 AND quantity>0",[jid,itemId])).rowCount)
  // Personagens repetidos continuam valendo 50 fragmentos universais.
  // Armas/armaduras repetidas permanecem como cópias reais (futura forja estelar).
  if(duplicate&&category==='personagem'){
    await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'fragmento_universal_raid',50) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+50",[jid])
  }else if(category==='personagem'){
    const level=70,xp=(level-1)*100,maxHp=petMaxHp(level,xp,itemId),energy=petMaxEnergy(level,itemId)
    await c.query(`INSERT INTO pet_collection(jid,species,name,level,xp,energy,power,hp,max_hp,active,purchase_price)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,FALSE,0)`,[jid,itemId,reward.name,level,xp,energy,reward.power,maxHp])
  }else{
    await c.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1",[jid,itemId])
  }
  return finish({category,reward:reward.name,duplicate,copyPreserved:duplicate&&category!=='personagem',ownedAfter:owned-7})
 })
}
async function collabFragmentBalance(jid){
 const {rows}=await db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jid,COLLAB_FRAGMENT_ITEM])
 return Number(rows[0]?.quantity||0)
}
// Reembolso opt-in e idempotente para upgrades de EQUIPAMENTO historicamente
// pagos com fragmentos. Nao altera Lv., estrelas ou saldos de dinheiro.
export async function claimCollabGearFragmentRefund(jid){
 return inTransaction(async c=>{
  const lock=await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  if(!lock.rowCount)throw new Error('Jogador não localizado.')
  const key='refund_collab_gear_fragments_20261026:'+jid
  const old=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]
  if(old)return {already:true,refunded:0,previous:Number(old.value?.refunded||0)}
  const audit=(await c.query(`SELECT COALESCE(SUM(amount),0)::bigint AS spent,COUNT(*)::int AS uses
    FROM transactions
    WHERE from_jid=$1 AND to_jid='upgrade' AND type='equipment_upgrade_collab_fragments' AND amount>0`,[jid])).rows[0]
  const spent=Number(audit?.spent||0)
  if(!Number.isSafeInteger(spent)||spent<0)throw new Error('Histórico inconsistente; nenhuma compensação efetuada.')
  if(spent===0)return {already:false,refunded:0,uses:0}
  const marker=await c.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING RETURNING key',[
    key,JSON.stringify({refunded:spent,uses:Number(audit.uses||0),source:'equipment_upgrade_collab_fragments',at:Date.now()})
  ])
  if(!marker.rowCount)return {already:true,refunded:0}
  await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3)
    ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,
    [jid,COLLAB_FRAGMENT_ITEM,spent])
  await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
    VALUES('refund',$1,0,'collab_fragment_gear_refund_20261026',$2)`,
    [jid,'refund:'+spent+' fragments, uses:'+Number(audit.uses||0)])
  const remaining=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jid,COLLAB_FRAGMENT_ITEM])).rows[0]
  return {already:false,refunded:spent,uses:Number(audit.uses||0),remaining:Number(remaining?.quantity||0)}
 })
}
export async function handleSetePecadosCollabCommand({cmd,args=[],sender,reply,messageId=null}){
 if(!['7pecados','setepecados','pecados7'].includes(cmd))return false
 await ensureUser(sender)
 const action=String(args[0]||'status').toLowerCase()

 if(['reembolso','reembolsar','devolucao'].includes(action)){
  const result=await claimCollabGearFragmentRefund(sender)
  if(result.already){
    await reply('✅ *REEMBOLSO JÁ PROCESSADO*\n\nA restituição foi registrada anteriormente: *'+fmt(result.previous||0)+' Fragmentos da Ascensão*. Nenhuma unidade foi creditada novamente.')
  }else if(result.refunded>0){
    await reply('🧩 *FRAGMENTOS DEVOLVIDOS!*\n\n⚔️ Upgrades de equipamento identificados: *'+result.uses+'*\n♻️ Fragmentos devolvidos: *+'+fmt(result.refunded)+'*\n📦 Saldo atual: *'+fmt(result.remaining)+'*\n✅ Seus níveis e equipamentos foram preservados. O reembolso só pode ocorrer uma vez.')
  }else{
    await reply('📋 *SEM GASTOS ELEGÍVEIS*\n\nNão encontrei no histórico deste jogador upgrades de armas ou armaduras pagos com Fragmentos da Ascensão. Nenhum saldo foi alterado.')
  }
  return true
 }
 if(['fragmentos','fragmento','farm'].includes(action)){
  const [balance,used]=await Promise.all([
    collabFragmentBalance(sender),
    db.query("SELECT value FROM trevo_settings WHERE key=$1",['collab_raid_fragments_daily:'+collabRaidBrazilDay()+':'+sender])
  ])
  const earnedToday=Math.max(0,Math.floor(Number(used.rows[0]?.value?.earned||0)))
  const remaining=Math.max(0,COLLAB_RAID_DAILY_CAP-earnedToday)
  await reply('🧩 *FRAGMENTOS DA ASCENSÃO — 7 PECADOS*\n\n'+
    '📦 Saldo atual: *'+fmt(balance)+'*\n'+
    '⚔️ *Raid dos Sete Pecados*: +'+COLLAB_RAID_FRAGMENTS_PER_WIN+' por vitória elegível.\n'+
    '📅 Farm de hoje: *'+earnedToday+'/'+COLLAB_RAID_DAILY_CAP+'* • pode ganhar mais *'+remaining+'*.\n'+
    '🔄 O limite renova à meia-noite (Brasília).\n\n'+
    '🌟 *Uso exclusivo: Forja Estelar da collab*\n'+
    '★★ 30 fragmentos • ★★★ 50 • ★★★★ 80 • ★★★★★ 120.\n'+
    '✅ Substituem a cópia extra; não são consumidas outras cópias de equipamentos.\n'+
    '⚔️ A primeira forja exige uma peça comum Lv.10; as próximas exigem a peça estrelada Lv.10.\n'+
    '🔒 Upgrades de nível são pagos com dinheiro; fragmentos não evoluem mais pets ou equipamentos.\n\n'+
    '👉 Use *!forjar* para escolher a peça.\n♻️ Quem gastou fragmentos em upgrades antigos pode usar *!7pecados reembolso*.\n'+
    '🌈 Edições da collab: *25/10 e 01/11*.')
  return true
 }
 if(['evoluir','upar','aprimorar'].includes(action)){
  await reply('🔒 *FRAGMENTOS RESERVADOS À FORJA*\n\nOs Fragmentos da Ascensão não aprimoram armas, armaduras ou companheiros de aventura.\n⚔️ Use *!uparitem* para melhorar equipamentos com dinheiro.\n🐾 Evolua seus companheiros pelos sistemas normais de pets.\n🌟 Use *!forjar* para transformar equipamentos dos Sete Pecados Lv.10 em peças estreladas usando os fragmentos, sem cópia extra.')
  return true
 }
 if(['forjar','forja'].includes(action)){
  await reply('🌟 *FORJA DOS SETE PECADOS*\n\nUse *!forjar* para escolher a arma ou armadura dos Sete Pecados.\n⚔️ Primeira estrela: uma peça comum Lv.10.\n🧩 Custos: ★★ 30 • ★★★ 50 • ★★★★ 80 • ★★★★★ 120 Fragmentos da Ascensão.\n✅ Não é necessária nenhuma cópia extra. A peça volta ao Lv.1 após cada estrela.')
  return true
 }
 if(['personagens','personagem','herois','heróis'].includes(action)){
  const entries=PECADOS_HEROES.map((hero,i)=>
   '*'+(i+1)+'. '+hero.name+'* — '+(BONUS_STYLE[hero.style]||hero.style)+'\n   '+collabHeroBonus(hero)).join('\n')
  await reply('🌈🐾 *COMPANHEIROS DE AVENTURA — 7 PECADOS*\n\n'+entries+'\n\n📦 Chance de companheiro por baú: *33,33%* (1 entre 7 nesta categoria).\n🎁 *!7pecados abrir* — custa 7 essências.\n♻️ Repetido: 50 Fragmentos Universais de Raid.')
  return true
 }
 if(['armas','arma'].includes(action)){
  const entries=PECADOS_WEAPONS.map((weapon,i)=>
   '*'+(i+1)+'. '+weapon.name+'*\n   '+collabGearBonus(weapon)).join('\n')
  await reply('🌈⚔️ *ARMAS — COLLAB 7 PECADOS*\n\n'+entries+'\n\n📊 Atributos no *Lv.1*; aprimoramentos até Lv.10 (2,5×).\n📦 Chance de arma por baú: *33,33%* (1 entre 7 nesta categoria).\n🎁 *!7pecados abrir* — custa 7 essências.\n♻️ Arma repetida: cópia adicional preservada; a forja permite usar fragmentos sem exigir outra cópia.')
  return true
 }
 if(['armaduras','armadura'].includes(action)){
  const entries=PECADOS_ARMORS.map((armor,i)=>
   '*'+(i+1)+'. '+armor.name+'*\n   '+collabGearBonus(armor)).join('\n')
  await reply('🌈🛡️ *ARMADURAS — COLLAB 7 PECADOS*\n\n'+entries+'\n\n📊 Atributos no *Lv.1*; aprimoramentos até Lv.10 (2,5×).\n📦 Chance de armadura por baú: *33,33%* (1 entre 7 nesta categoria).\n🎁 *!7pecados abrir* — custa 7 essências.\n♻️ Armadura repetida: cópia adicional preservada; a forja permite usar fragmentos sem exigir outra cópia.')
  return true
 }
 if(action==='ajuda'){
  await reply('🌈 *COLLAB DOS 7 PECADOS — COMANDOS*\n\n📋 *!7pecados* — Calendário, essências e coleção\n🐾 *!7pecados personagens* — Os 7 companheiros de aventura e seus bônus\n⚔️ *!7pecados armas* — As 7 armas e seus atributos\n🛡️ *!7pecados armaduras* — As 7 armaduras e seus atributos\n🎁 *!7pecados abrir* — Abre um baú usando 7 essências\n🧩 *!7pecados fragmentos* — Saldo e custos do Boss de farm\n🌟 *!forjar* — Forja especial com fragmentos, sem cópias extras\n♻️ *!7pecados reembolso* — Devolver gasto antigo de fragmentos em upgrades de equipamentos (uma vez)\n👹 *!boss* — Boss global ativo\n⚔️ *!atacar* — Ataca o Boss\n\n🎲 Cada categoria tem chance de 1/3 no baú.\n🩸 Essências repetidas *ACUMULAM*, não viram dinheiro.\n♻️ Companheiro repetido: *50 Fragmentos Universais de Raid*. Armas e armaduras repetidas: *cópias preservadas* para futura forja.\n📅 25/10 e 01/11, das 18h às 20h (Brasília).\n✅ As consultas não gastam essências.')
  return true
 }

 if(action==='abrir'||action==='bau'||action==='caixa'){
  const r=await openBox(sender,messageId)
  if(r.unknown){await reply('⚠️ Esta mensagem já foi processada, mas o resultado não pôde ser recuperado. Nenhuma essência foi consumida novamente.');return true}
  const replayNotice=r.replay?'🔁 *Mensagem já processada.* Nenhuma essência foi cobrada novamente.\n\n':''
  if(r.insufficient)await reply(replayNotice+'🌈 *BAÚ DOS 7 PECADOS*\n\nSão necessárias *7 essências* de qualquer pecado. Você possui *'+fmt(r.owned)+'*.\nUse *!7pecados* para consultar o calendário.')
  else await reply(replayNotice+'🌈🎁 *BAÚ DOS 7 PECADOS ABERTO!*\n\n'+(r.copyPreserved?'♻️ *EQUIPAMENTO REPETIDO:* '+r.reward+'\n📦 Nova cópia guardada no inventário para futura forja estelar.':r.duplicate?'♻️ *COMPANHEIRO REPETIDO:* '+r.reward+'\n🎁 Recebeu *50 Fragmentos Universais de Raid*.':'✅ *'+(r.category==='personagem'?'COMPANHEIRO DE AVENTURA':r.category.toUpperCase())+':* '+r.reward+'\n🎉 Adicionado à sua coleção!')+'\n\n🩸 Essências restantes: *'+fmt(r.ownedAfter)+'*.')
  return true
 }
 if(action==='resgatar'||action==='compensacao'){
  await reply('✅ O período de compensações históricas foi encerrado. Os inventários restaurados são definitivos e não há novos resgates retroativos.')
  return true
 }
 if(action!=='status'){await reply('🌈 Comando não reconhecido. Use *!7pecados ajuda* para ver as opções.');return true}
 const rows=(await db.query("SELECT item_id,quantity FROM inventories WHERE jid=$1 AND item_id=ANY($2::text[])",[sender,PECADOS_ESSENCES])).rows
 const qty=rows.reduce((n,r)=>n+Number(r.quantity||0),0)
 const h=(await db.query("SELECT COUNT(DISTINCT species)::int AS n FROM pet_collection WHERE jid=$1 AND species=ANY($2::text[])",[sender,PECADOS_HEROES.map(p=>p.species)])).rows[0]
 const g=(await db.query("SELECT COUNT(DISTINCT item_id)::int AS n FROM inventories WHERE jid=$1 AND item_id=ANY($2::text[]) AND quantity>0",[sender,PECADOS_GEAR_IDS])).rows[0]
 const future=PECADOS_EDITIONS.filter(x=>Date.now()<x.end).map(x=>new Date(x.start).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}))
 await reply('🌈 *COLLAB — 7 PECADOS CAPITAIS*\n\n🩸 Essências: *'+fmt(qty)+'* (*'+Math.floor(qty/7)+' baú(s)*)\n🐾 Companheiros: *'+fmt(h?.n)+'/7*\n⚔️🛡️ Equipamentos: *'+fmt(g?.n)+'/14*\n🎁 Cada baú: *7 essências*\n🎲 Personagem 1/3 | Arma 1/3 | Armadura 1/3\n♻️ Companheiro repetido: *50 Fragmentos Universais*. Equipamento repetido: *cópia preservada; fragmentos substituem cópias extras*\n📅 Domingos *25/10 e 01/11, 18h–20h* (Brasília).\n'+(future.length?'Próximas edições: '+future.join(' e '):'Distribuição encerrada; essências restantes continuam válidas.')+'\n\n👉 *!7pecados armas* • *personagens* • *armaduras*\n👉 *!7pecados abrir* — Abrir um baú\n👉 *!7pecados ajuda* — Ver todos os comandos')
 return true
}
