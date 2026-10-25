import {db,ensureUser,petMaxHp,petMaxEnergy} from './db.js'
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
export async function handleSetePecadosCollabCommand({cmd,args=[],sender,reply,messageId=null}){
 if(!['7pecados','setepecados','pecados7'].includes(cmd))return false
 await ensureUser(sender)
 const action=String(args[0]||'status').toLowerCase()

 if(['personagens','personagem','herois','heróis'].includes(action)){
  const entries=PECADOS_HEROES.map((hero,i)=>
   '*'+(i+1)+'. '+hero.name+'* — '+(BONUS_STYLE[hero.style]||hero.style)+'\n   '+collabHeroBonus(hero)).join('\n')
  await reply('🌈🐾 *PERSONAGENS — COLLAB 7 PECADOS*\n\n'+entries+'\n\n📦 Chance de personagem por baú: *33,33%* (1 entre 7 nesta categoria).\n🎁 *!7pecados abrir* — custa 7 essências.\n♻️ Repetido: 50 Fragmentos Universais de Raid.')
  return true
 }
 if(['armas','arma'].includes(action)){
  const entries=PECADOS_WEAPONS.map((weapon,i)=>
   '*'+(i+1)+'. '+weapon.name+'*\n   '+collabGearBonus(weapon)).join('\n')
  await reply('🌈⚔️ *ARMAS — COLLAB 7 PECADOS*\n\n'+entries+'\n\n📊 Atributos no *Lv.1*; aprimoramentos até Lv.10 (2,5×).\n📦 Chance de arma por baú: *33,33%* (1 entre 7 nesta categoria).\n🎁 *!7pecados abrir* — custa 7 essências.\n♻️ Arma repetida: cópia adicional guardada para futura forja.')
  return true
 }
 if(['armaduras','armadura'].includes(action)){
  const entries=PECADOS_ARMORS.map((armor,i)=>
   '*'+(i+1)+'. '+armor.name+'*\n   '+collabGearBonus(armor)).join('\n')
  await reply('🌈🛡️ *ARMADURAS — COLLAB 7 PECADOS*\n\n'+entries+'\n\n📊 Atributos no *Lv.1*; aprimoramentos até Lv.10 (2,5×).\n📦 Chance de armadura por baú: *33,33%* (1 entre 7 nesta categoria).\n🎁 *!7pecados abrir* — custa 7 essências.\n♻️ Armadura repetida: cópia adicional guardada para futura forja.')
  return true
 }
 if(action==='ajuda'){
  await reply('🌈 *COLLAB DOS 7 PECADOS — COMANDOS*\n\n📋 *!7pecados* — Calendário, essências e coleção\n🐾 *!7pecados personagens* — Os 7 personagens e seus bônus\n⚔️ *!7pecados armas* — As 7 armas e seus atributos\n🛡️ *!7pecados armaduras* — As 7 armaduras e seus atributos\n🎁 *!7pecados abrir* — Abre um baú usando 7 essências\n👹 *!boss* — Boss global ativo\n⚔️ *!atacar* — Ataca o Boss\n\n🎲 Cada categoria tem chance de 1/3 no baú.\n🩸 Essências repetidas *ACUMULAM*, não viram dinheiro.\n♻️ Personagem repetido: *50 Fragmentos Universais de Raid*. Armas e armaduras repetidas: *cópias preservadas* para futura forja.\n📅 25/10 e 01/11, das 18h às 20h (Brasília).\n✅ As consultas não gastam essências.')
  return true
 }

 if(action==='abrir'||action==='bau'||action==='caixa'){
  const r=await openBox(sender,messageId)
  if(r.unknown){await reply('⚠️ Esta mensagem já foi processada, mas o resultado não pôde ser recuperado. Nenhuma essência foi consumida novamente.');return true}
  const replayNotice=r.replay?'🔁 *Mensagem já processada.* Nenhuma essência foi cobrada novamente.\n\n':''
  if(r.insufficient)await reply(replayNotice+'🌈 *BAÚ DOS 7 PECADOS*\n\nSão necessárias *7 essências* de qualquer pecado. Você possui *'+fmt(r.owned)+'*.\nUse *!7pecados* para consultar o calendário.')
  else await reply(replayNotice+'🌈🎁 *BAÚ DOS 7 PECADOS ABERTO!*\n\n'+(r.copyPreserved?'♻️ *EQUIPAMENTO REPETIDO:* '+r.reward+'\n📦 Nova cópia guardada no inventário para futura forja estelar.':r.duplicate?'♻️ *PERSONAGEM REPETIDO:* '+r.reward+'\n🎁 Recebeu *50 Fragmentos Universais de Raid*.':'✅ *'+r.category.toUpperCase()+':* '+r.reward+'\n🎉 Adicionado à sua coleção!')+'\n\n🩸 Essências restantes: *'+fmt(r.ownedAfter)+'*.')
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
 await reply('🌈 *COLLAB — 7 PECADOS CAPITAIS*\n\n🩸 Essências: *'+fmt(qty)+'* (*'+Math.floor(qty/7)+' baú(s)*)\n🐾 Personagens: *'+fmt(h?.n)+'/7*\n⚔️🛡️ Equipamentos: *'+fmt(g?.n)+'/14*\n🎁 Cada baú: *7 essências*\n🎲 Personagem 1/3 | Arma 1/3 | Armadura 1/3\n♻️ Personagem repetido: *50 Fragmentos Universais*. Equipamento repetido: *cópia preservada para forja*\n📅 Domingos *25/10 e 01/11, 18h–20h* (Brasília).\n'+(future.length?'Próximas edições: '+future.join(' e '):'Distribuição encerrada; essências restantes continuam válidas.')+'\n\n👉 *!7pecados armas* • *personagens* • *armaduras*\n👉 *!7pecados abrir* — Abrir um baú\n👉 *!7pecados ajuda* — Ver todos os comandos')
 return true
}
