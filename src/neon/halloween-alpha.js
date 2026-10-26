import {db,ensureUser,equipmentStatsAtLevel,getEquipmentStarLevels,petTeamSynergy,petMaxHp,petMaxEnergy,grantExpInTransaction} from './db.js'
import {PET_STATUS_SPECIALTIES} from './game-catalog.js'
import {HALLOWEEN_START,HALLOWEEN_END,HALLOWEEN_SHOP_END,HALLOWEEN_SOUL_ID,HALLOWEEN_CORCEL,HALLOWEEN_CORCEL_COST,HALLOWEEN_GEAR,HALLOWEEN_BOSSES,halloweenBoss,halloweenActive,halloweenLocalDay,halloweenMinimumDamage,halloweenPhases,halloweenDropCatalog} from './halloween-rules.js'

const fmt=n=>Math.floor(Number(n)||0).toLocaleString('pt-BR')
const nowSec=()=>Math.floor(Date.now()/1000)
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const ATTACK_MS=10000
const REVIVE_MS=120000
const POWER_REFRESH_MS=10*60000
let scheduler=null
let running=false
let latestNotices=[]
async function tx(fn){
 const c=await db.connect()
 try{await c.query('BEGIN');const out=await fn(c);await c.query('COMMIT');return out}
 catch(error){await c.query('ROLLBACK');throw error} finally{c.release()}
}
export async function initHalloweenAlpha(){
 await db.query(`CREATE TABLE IF NOT EXISTS halloween_boss_days_2026(
  day TEXT PRIMARY KEY,cycle INTEGER NOT NULL DEFAULT 1,hp BIGINT NOT NULL,max_hp BIGINT NOT NULL,
  revive_at BIGINT NOT NULL DEFAULT 0,started_at BIGINT NOT NULL,updated_at BIGINT NOT NULL)`)
 await db.query(`CREATE TABLE IF NOT EXISTS halloween_players_2026(
  jid TEXT PRIMARY KEY REFERENCES users(jid),name TEXT NOT NULL,chat TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,day TEXT NOT NULL DEFAULT '',
  day_damage BIGINT NOT NULL DEFAULT 0,all_damage BIGINT NOT NULL DEFAULT 0,
  round_damage BIGINT NOT NULL DEFAULT 0,hits BIGINT NOT NULL DEFAULT 0,
  character_xp BIGINT NOT NULL DEFAULT 0,pet_xp BIGINT NOT NULL DEFAULT 0,
  power INTEGER NOT NULL DEFAULT 0,defense INTEGER NOT NULL DEFAULT 0,
  power_refreshed BIGINT NOT NULL DEFAULT 0,last_attack BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0)`)
 await db.query(`CREATE TABLE IF NOT EXISTS halloween_rewards_2026(
  day TEXT NOT NULL,cycle INTEGER NOT NULL,jid TEXT NOT NULL,
  milestone TEXT NOT NULL,item_id TEXT NOT NULL,amount INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(day,cycle,jid,milestone))`)
 await db.query(`CREATE TABLE IF NOT EXISTS halloween_drops_2026(
  jid TEXT NOT NULL,item_id TEXT NOT NULL,day TEXT NOT NULL,cycle INTEGER NOT NULL,
  created_at BIGINT NOT NULL,PRIMARY KEY(jid,item_id))`)
 await db.query(`CREATE TABLE IF NOT EXISTS halloween_shop_2026(
  jid TEXT NOT NULL,reward_id TEXT NOT NULL,created_at BIGINT NOT NULL,
  PRIMARY KEY(jid,reward_id))`)
 // Catalog initialization runs first. No additional schema modification to existing systems.
 console.log('[HALLOWEEN] schema ready; first day Oct 26, 6 global bosses, 4 drops')
}
async function ensureDay(c,boss){
 const day=boss.day
 await c.query(`INSERT INTO halloween_boss_days_2026(day,hp,max_hp,started_at,updated_at)
  VALUES($1,$2,$2,$3,$3) ON CONFLICT(day) DO NOTHING`,[day,boss.hp,Date.now()])
 const r=await c.query('SELECT * FROM halloween_boss_days_2026 WHERE day=$1 FOR UPDATE',[day])
 return r.rows[0]
}
async function snapshotPower(c,jid){
 const st=(await c.query('SELECT hp,atk,def,weapon_id,armor_id,boot_id,helmet_id FROM stats WHERE jid=$1',[jid])).rows[0]
 if(!st)return {power:0,defense:0}
 const ids=[st.weapon_id,st.armor_id,st.boot_id,st.helmet_id].filter(Boolean)
 const upgrades=ids.length?(await c.query('SELECT item_id,level FROM equipment_upgrades WHERE jid=$1 AND item_id=ANY($2::text[])',[jid,ids])).rows:[]
 const levels=Object.fromEntries(upgrades.map(r=>[r.item_id,Number(r.level)||1]))
 const stars=await getEquipmentStarLevels(jid,ids,c)
 let atk=Number(st.atk||0),defense=Number(st.def||0),crit=0
 for(const item of ids){
  const g=equipmentStatsAtLevel(item,levels[item]||1,stars[item]||1)
  atk+=Number(g?.atk||0);defense+=Number(g?.def||0);crit+=Number(g?.crit||0)
 }
 const pets=(await c.query(`SELECT p.species,p.level,p.hp,p.energy,t.slot FROM pet_team t
 JOIN pet_collection p ON p.id=t.pet_id WHERE t.jid=$1 AND t.slot IN (1,2,3) ORDER BY t.slot`,[jid])).rows
 const synergy=petTeamSynergy(pets)||{}
 const primary=pets.find(p=>Number(p.slot)===1&&Number(p.hp)>0&&Number(p.energy)>0)
 const petStats=primary?PET_STATUS_SPECIALTIES[primary.species]?.stats||{}:{}
 const petDamage=Math.min(.15,Number(petStats.damage||0)/100)+Math.min(.15,Number(petStats.bossDamage||0)/100)
 const petCrit=Math.min(.15,Number(petStats.crit||0)/100)
 const power=Math.max(1,Math.floor((atk*(1+Math.min(.3,petDamage)+Number(synergy.attack||0)))*(1+Math.min(.6,crit+petCrit+Number(synergy.crit||0))*.30)))
 return {power,defense:Math.max(0,Math.floor(defense))}
}
async function credit(c,jid,item,quantity){
 if(quantity<=0)return
 await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3)
  ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,[jid,item,quantity])
}
async function petXp(c,jid,base){
 const team=(await c.query(`SELECT p.* ,t.slot FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id
  WHERE t.jid=$1 AND t.slot IN(1,2,3) ORDER BY t.slot FOR UPDATE OF p`,[jid])).rows
 const awards=[]
 for(const p of team){
  const weight=Number(p.slot)===1?1:Number(p.slot)===2?.6:.35
  const gain=Math.max(1,Math.round(base*weight))
  const oldLevel=Number(p.level)||1
  const xp=Math.min(9900,Number(p.xp||0)+gain)
  const level=Math.min(100,1+Math.floor(xp/100))
  const hpMax=petMaxHp(level,xp,p.species)
  const hp=Math.min(hpMax,Math.max(0,Number(p.hp||0)+Math.max(0,hpMax-Number(p.max_hp||0))))
  const power=Number(p.power||0)+Math.max(0,level-oldLevel)*2
  await c.query('UPDATE pet_collection SET xp=$1,level=$2,power=$3,max_hp=$4,hp=$5 WHERE id=$6',[xp,level,power,hpMax,hp,p.id])
  if(p.active)await c.query('UPDATE pets SET xp=$1,level=$2,power=$3,max_hp=$4,hp=$5 WHERE jid=$6',[xp,level,power,hpMax,hp,jid])
  awards.push({slot:p.slot,name:p.name,xp:gain})
 }
 return awards
}
async function milestoneReward(c,day,cycle,player,part,boss,kind){
 const threshold=halloweenMinimumDamage(boss.hp)
 if(Number(player.round_damage)<threshold)return null
 const qty=kind==='kill'?8:4
 const marker=kind==='kill'?'kill':String(part)
 const inserted=await c.query(`INSERT INTO halloween_rewards_2026(day,cycle,jid,milestone,item_id,amount,created_at)
 VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING jid`,
 [day,cycle,player.jid,marker,HALLOWEEN_SOUL_ID,qty,nowSec()])
 if(!inserted.rowCount)return null
 await credit(c,player.jid,HALLOWEEN_SOUL_ID,qty)
 const playerXp=kind==='kill'?7000:2400
 const petGain=kind==='kill'?1100:400
 await grantExpInTransaction(c,player.jid,playerXp,{ignoreXpBoost:true,ignoreGroupProgressionEvent:true})
 await petXp(c,player.jid,petGain)
 await c.query('UPDATE halloween_players_2026 SET character_xp=character_xp+$1,pet_xp=pet_xp+$2 WHERE jid=$3',[playerXp,petGain,player.jid])
 return {jid:player.jid,name:player.name,qty,xp:playerXp,petXp:petGain}
}
async function maybeDrop(c,jid,boss,cycle){
 const found=[]
 for(const gear of halloweenDropCatalog(Date.parse(boss.day+'T12:00:00-03:00'))){
  if(Math.random()>=gear.chance)continue
  const claimed=await c.query(`INSERT INTO halloween_drops_2026(jid,item_id,day,cycle,created_at)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING item_id`,[jid,gear.id,boss.day,cycle,nowSec()])
  if(!claimed.rowCount)continue
  await credit(c,jid,gear.id,1)
  await c.query(`INSERT INTO bound_inventory_items(jid,item_id,source_key,quantity)
   VALUES($1,$2,$3,1) ON CONFLICT(jid,item_id,source_key) DO NOTHING`,[jid,gear.id,'halloween:20261026'])
  found.push(gear.name)
 }
 return found
}
function damageModifier(boss,phase){
 const i=HALLOWEEN_BOSSES.findIndex(b=>b.day===boss.day)
 return [.90,1.05,.88,.91,.93,1][i] * (phase===3?.95:1)
}
async function applyRetaliation(c,player,boss,phase){
 // A retaliação ocorre a cada 12 golpes; o jogador pode continuar com cura.
 if(Number(player.hits)%12!==0)return
 const st=(await c.query('SELECT hp,max_hp FROM stats WHERE jid=$1 FOR UPDATE',[player.jid])).rows[0]
 if(!st||Number(st.hp)<=0)return
 const amount=Math.max(8,Math.floor((boss.atk*(phase===3?1.40:phase===2?1.20:1)-Number(player.defense||0)*.20)*.32))
 let hp=Math.max(0,Number(st.hp)-amount)
 if(hp<=Math.max(20,Number(st.max_hp)*.23)){
  const potion=(await c.query(`SELECT quantity FROM inventories WHERE jid=$1 AND item_id='elixir_supremo' AND quantity>0 FOR UPDATE`,[player.jid])).rows[0]
  if(potion){
   await c.query(`UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id='elixir_supremo' AND quantity>0`,[player.jid])
   hp=Math.min(Number(st.max_hp),hp+900)
  }
 }
 await c.query('UPDATE stats SET hp=$1 WHERE jid=$2',[hp,player.jid])
 // Pet pode cair e usar poções próprias; não força gasto se esgotadas.
 const pet=(await c.query('SELECT hp,max_hp,energy FROM pets WHERE jid=$1 FOR UPDATE',[player.jid])).rows[0]
 if(!pet)return
 let petHp=Math.max(0,Number(pet.hp)-Math.round(amount*.5))
 let energy=Math.max(0,Number(pet.energy)-1)
 if(petHp<=Number(pet.max_hp)*.22){
  const potion=(await c.query(`SELECT item_id,quantity FROM inventories WHERE jid=$1
  AND item_id IN ('pocao_pet_suprema','pocao_pet_epica') AND quantity>0
  ORDER BY CASE WHEN item_id='pocao_pet_epica' THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE`,[player.jid])).rows[0]
  if(potion){
   await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2 AND quantity>0',[player.jid,potion.item_id])
   petHp=Math.min(Number(pet.max_hp),petHp+(potion.item_id==='pocao_pet_epica'?400:800))
  }
 }
 if(energy<=2){
  const inv=(await c.query(`SELECT quantity FROM inventories WHERE jid=$1 AND item_id='energetico_pet' AND quantity>0 FOR UPDATE`,[player.jid])).rows[0]
  if(inv){
   await c.query(`UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id='energetico_pet' AND quantity>0`,[player.jid])
   energy=100
  }
 }
 await c.query('UPDATE pets SET hp=$1,energy=$2 WHERE jid=$3',[petHp,energy,player.jid])
 await c.query('UPDATE pet_collection SET hp=$1,energy=$2 WHERE jid=$3 AND active=TRUE',[petHp,energy,player.jid])
}
async function tickHalloween(){
 const now=Date.now()
 const boss=halloweenBoss(now)
 if(!boss)return []
 return tx(async c=>{
  const locked=await c.query(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`,['halloween-global-20261026'])
  if(!locked.rows[0]?.locked)return []
  let state=await ensureDay(c,boss)
  const alerts=[]
  if(Number(state.hp)<=0){
   if(now<Number(state.revive_at||0))return []
   const cycle=Number(state.cycle)+1
   await c.query('UPDATE halloween_boss_days_2026 SET cycle=$2,hp=max_hp,revive_at=0,updated_at=$3 WHERE day=$1',[boss.day,cycle,now])
   await c.query('UPDATE halloween_players_2026 SET round_damage=0 WHERE active=TRUE')
   state={...state,cycle,hp:state.max_hp,revive_at:0}
   alerts.push({type:'respawn',boss:boss.name,cycle})
  }
  const players=(await c.query(`SELECT * FROM halloween_players_2026 WHERE active=TRUE ORDER BY jid LIMIT 30 FOR UPDATE`)).rows
  if(!players.length)return alerts
  let hp=Number(state.hp)
  const oldHp=hp
  let hitCount=0
  for(const row of players){
   if(hp<=0)break
   if(now-Number(row.last_attack||0)<ATTACK_MS-200)continue
   if(String(row.day)!==boss.day){
    await c.query('UPDATE halloween_players_2026 SET day=$1,day_damage=0,round_damage=0,power_refreshed=0 WHERE jid=$2',[boss.day,row.jid])
    row.round_damage=0;row.day_damage=0;row.power_refreshed=0
   }
   const sleeping=(await c.query(`SELECT
     EXISTS(SELECT 1 FROM player_sleep WHERE jid=$1 AND ends_at>$2) AS sleeping,
     EXISTS(SELECT 1 FROM player_carpinar WHERE jid=$1 AND ends_at>$2) AS carpindo,
     (SELECT hp FROM stats WHERE jid=$1) AS current_hp,
     (SELECT hp FROM pets WHERE jid=$1) AS pet_hp`,[row.jid,nowSec()])).rows[0]
   if(sleeping?.sleeping||sleeping?.carpindo||Number(sleeping?.current_hp||0)<=0)continue
   if(now-Number(row.power_refreshed||0)>POWER_REFRESH_MS||Number(row.power||0)<=0){
    const snap=await snapshotPower(c,row.jid)
    row.power=snap.power;row.defense=snap.defense
    await c.query('UPDATE halloween_players_2026 SET power=$1,defense=$2,power_refreshed=$3 WHERE jid=$4',[snap.power,snap.defense,now,row.jid])
   }
   const phase=halloweenPhases(hp,Number(state.max_hp))
   const critical=Math.random()<.12
   const evasion=boss.day==='2026-10-26' && Math.random()<.07
   const petMod=Number(sleeping.pet_hp||0)>0?1:.87
   const damage=evasion?0:Math.max(1,Math.round(Number(row.power||1)*(critical?1.5:1)*(.85+Math.random()*.3)*damageModifier(boss,phase)*petMod))
   const hit=Math.min(hp,damage)
   if(!hit)continue
   hp-=hit;hitCount++
   row.hits=Number(row.hits)+1;row.round_damage=Number(row.round_damage)+hit
   row.day_damage=Number(row.day_damage)+hit
   await c.query(`UPDATE halloween_players_2026 SET hits=$1,round_damage=round_damage+$2,
   day_damage=day_damage+$2,all_damage=all_damage+$2,last_attack=$3,updated_at=$3 WHERE jid=$4`,
   [row.hits,hit,now,row.jid])
   await applyRetaliation(c,row,boss,phase)
  }
  if(!hitCount)return alerts
  // O último golpe só muda o HP do ciclo que estava ativo; jamais amplia HP.
  await c.query('UPDATE halloween_boss_days_2026 SET hp=$2,updated_at=$3,revive_at=$4 WHERE day=$1',
   [boss.day,hp,now,hp===0?now+REVIVE_MS:0])
  const cycles=Number(state.cycle)
  const milestones=[.25,.50,.75,1]
  const crossed=milestones.filter(q=>oldHp>Number(state.max_hp)*(1-q)&&hp<=Number(state.max_hp)*(1-q))
  if(crossed.length || hp===0){
   const rows=(await c.query('SELECT * FROM halloween_players_2026 WHERE active=TRUE AND day=$1 AND round_damage>0 ORDER BY round_damage DESC FOR UPDATE',[boss.day])).rows
   for(const m of crossed){
    for(const p of rows)await milestoneReward(c,boss.day,cycles,p,Math.round(m*100),boss,'quarter')
   }
   if(hp===0){
    const ranking=[]
    const drops=[]
    for(const p of rows){
     const win=await milestoneReward(c,boss.day,cycles,p,100,boss,'kill')
     if(win){ranking.push({name:p.name,damage:Number(p.round_damage),souls:win.qty}); const items=await maybeDrop(c,p.jid,boss,cycles);if(items.length)drops.push({name:p.name,items})}
    }
    alerts.push({type:'defeated',boss:boss.name,cycle:cycles,ranking,drops})
    console.log('[HALLOWEEN] boss derrotado',JSON.stringify({day:boss.day,cycle:cycles,eligible:ranking.length,drops:drops.length}))
   }
  }
  return alerts
 })
}
async function buyCorcel(jid){
 if(Date.now()<Date.parse('2026-10-31T00:00:00-03:00')||Date.now()>=HALLOWEEN_SHOP_END)throw new Error('O Altar das Almas abre sábado (31/10) e fecha domingo ao meio-dia.')
 return tx(async c=>{
  await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const owned=await c.query('SELECT 1 FROM pet_collection WHERE jid=$1 AND species=$2 LIMIT 1',[jid,HALLOWEEN_CORCEL])
  if(owned.rowCount)throw new Error('Você já possui o Corcel Espectral. Apenas 1 por jogador.')
  const claimed=await c.query('SELECT 1 FROM halloween_shop_2026 WHERE jid=$1 AND reward_id=$2',[jid,HALLOWEEN_CORCEL])
  if(claimed.rowCount)throw new Error('Seu Corcel Espectral já foi resgatado.')
  const inv=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,HALLOWEEN_SOUL_ID])).rows[0]
  if(Number(inv?.quantity||0)<HALLOWEEN_CORCEL_COST)throw new Error('São necessárias '+HALLOWEEN_CORCEL_COST+' Almas Amaldiçoadas. Você tem '+Number(inv?.quantity||0)+'.')
  await c.query('INSERT INTO halloween_shop_2026(jid,reward_id,created_at) VALUES($1,$2,$3)',[jid,HALLOWEEN_CORCEL,nowSec()])
  await c.query('UPDATE inventories SET quantity=quantity-$1 WHERE jid=$2 AND item_id=$3',[HALLOWEEN_CORCEL_COST,jid,HALLOWEEN_SOUL_ID])
  const level=70,xp=6900,hp=petMaxHp(level,xp,HALLOWEEN_CORCEL),energy=petMaxEnergy(level,HALLOWEEN_CORCEL)
  const pet=(await c.query(`INSERT INTO pet_collection(jid,species,name,level,xp,energy,power,hp,max_hp,active)
  VALUES($1,$2,'Corcel Espectral', $3,$4,$5,315,$6,$6,FALSE) RETURNING id`,
  [jid,HALLOWEEN_CORCEL,level,xp,energy,hp])).rows[0]
  await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
    VALUES($1,'halloween',0,'halloween_corcel_claim',$2)`,[jid,'100 Almas; pet ID '+pet.id])
  return {petId:pet.id,remaining:Number(inv.quantity)-HALLOWEEN_CORCEL_COST}
 })
}
async function status(jid){
 const boss=halloweenBoss()
 const [p,inv,bs]=await Promise.all([
 db.query('SELECT * FROM halloween_players_2026 WHERE jid=$1',[jid]),
 db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jid,HALLOWEEN_SOUL_ID]),
 boss?db.query('SELECT cycle,hp,max_hp,revive_at FROM halloween_boss_days_2026 WHERE day=$1',[boss.day]):Promise.resolve({rows:[]})
 ])
 return {boss,player:p.rows[0],souls:Number(inv.rows[0]?.quantity||0),state:bs.rows[0]||null}
}
function formatStatus(s){
 const active=s.player?.active?'✅ Combate automático ativado':'⏸️ Fora do combate'
 const state=s.state
 return '🎃 *HALLOWEEN ALPHA — CAÇADA DAS ALMAS*\n'+
 (s.boss?'👹 *'+s.boss.name+'*\n🛡️ '+s.boss.mechanic+'\n❤️ HP: *'+fmt(state?.hp??s.boss.hp)+'/'+fmt(state?.max_hp??s.boss.hp)+'* • Ciclo '+Number(state?.cycle||1)+(Number(state?.revive_at)>Date.now()?' • Ressurge em breve':'')+'\n':'🏁 Bosses encerrados. A loja encerra domingo ao meio-dia.\n')+
 '⚔️ '+active+' • ataque a cada *10 segundos*\n'+
 '🧩 Suas Almas: *'+fmt(s.souls)+'* (sem limite diário)\n'+
 '✨ *2× XP* do personagem e do time pet nos marcos de vitória\n'+
 '📈 Seu dano total: *'+fmt(s.player?.all_damage||0)+'*\n'+
 '🐎 Corcel Espectral: *100 Almas* — trocas no sábado\n'+
 '🎁 2 elmos + 2 botas exclusivos por drop de Boss\n\n'+
 '👉 *!halloween entrar* • *!halloween sair* • *!halloween ranking* • *!halloween loja*'
}
export async function handleHalloweenCommand({cmd,args=[],sender,name,chat,reply}){
 if(!['halloween','hallow','dia-das-bruxas'].includes(cmd))return false
 await ensureUser(sender,name||'')
 const action=String(args[0]||'status').toLowerCase()
 if(['entrar','participar','atacar','iniciar'].includes(action)){
  const boss=halloweenBoss()
  if(!boss){await reply('🎃 As batalhas de Halloween acontecem de 26/10 a 31/10. A loja abre sábado.');return true}
  const saved=await tx(async c=>{
   const current=(await c.query('SELECT chat,active FROM halloween_players_2026 WHERE jid=$1 FOR UPDATE',[sender])).rows[0]
   if(current?.active&&current.chat!==chat)throw new Error('Você já está atacando em outro grupo. Use o grupo original ou !halloween sair.')
   const snap=await snapshotPower(c,sender)
   await c.query(`INSERT INTO halloween_players_2026(jid,name,chat,day,power,defense,power_refreshed,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7)
    ON CONFLICT(jid) DO UPDATE SET name=EXCLUDED.name,chat=EXCLUDED.chat,active=TRUE,
    power=EXCLUDED.power,defense=EXCLUDED.defense,power_refreshed=EXCLUDED.power_refreshed,updated_at=EXCLUDED.updated_at`,
    [sender,name||'Jogador',chat,boss.day,snap.power,snap.defense,Date.now()])
   return snap
  })
  await reply('🎃⚔️ *ENTROU NO HALLOWEEN!*\n👹 '+boss.name+'\n⚔️ Ataques automáticos a cada 10s, inclusive após reconexão.\n💥 Poder de ataque estimado: '+fmt(saved.power)+'\n🧩 Farm ilimitado por participação real.\n🛡️ Personagem e pet sofrem dano; poções e energéticos disponíveis podem ser usados automaticamente.\nUse *!halloween status* para acompanhar.')
  return true
 }
 if(['sair','parar'].includes(action)){
  await db.query('UPDATE halloween_players_2026 SET active=FALSE,updated_at=$2 WHERE jid=$1',[sender,Date.now()])
  await reply('⏸️ Combate automático do Halloween pausado. Seus fragmentos, XP e pontos foram preservados.')
  return true
 }
 if(['atualizar','recalcular'].includes(action)){
  const r=await tx(async c=>{
   const snap=await snapshotPower(c,sender)
   await c.query('UPDATE halloween_players_2026 SET power=$1,defense=$2,power_refreshed=$3 WHERE jid=$4',[snap.power,snap.defense,Date.now(),sender])
   return snap
  })
  await reply('⚔️ Atributos do Halloween atualizados: poder '+fmt(r.power)+'.')
  return true
 }
 if(['trocar','resgatar','comprar'].includes(action)){
  if(!['corcel','cavalo','pet','corcel-espectral'].includes(String(args[1]||'').toLowerCase())){await reply('🐎 Para resgatar o Corcel Espectral, use *!halloween trocar corcel* no sábado. Custa 100 Almas Amaldiçoadas.');return true}
  const r=await buyCorcel(sender)
  await reply('🐎✨ *CORCEL ESPECTRAL RESGATADO!*\n✅ Pet lendário Místico adicionado à coleção. ID: *'+r.petId+'*\n🧩 Almas restantes: *'+fmt(r.remaining)+'*\n📜 Use *!meuspets* para localizar e *!equiparpet* para equipá-lo.')
  return true
 }
 if(['loja','altar'].includes(action)){
  const s=await status(sender)
  await reply('🎃 *ALTAR DAS ALMAS — HALLOWEEN*\n🧩 Saldo: *'+fmt(s.souls)+'* Almas Amaldiçoadas\n\n🐎 *Corcel Espectral — 100 almas*\n✨ Lendário Místico, 1 por jogador\n🎁 Os 2 elmos e 2 pares de botas são DROPS dos Bosses, não itens da loja.\n⏰ Trocas: 31/10 00h até 01/11 12h.\n👉 *!halloween trocar corcel*')
  return true
 }
 if(['ranking','top'].includes(action)){
  const r=await db.query(`SELECT name,day_damage,all_damage,hits FROM halloween_players_2026 ORDER BY all_damage DESC LIMIT 10`)
  await reply('🏆 *RANKING GLOBAL HALLOWEEN*\n\n'+(r.rows.length?r.rows.map((p,i)=>(i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅')+' '+p.name+' — '+fmt(p.all_damage)+' dano • '+fmt(p.hits)+' golpes').join('\n'):'Nenhum participante ainda.')+'\n\n🧩 As Almas são creditadas diretamente no inventário por participação.')
  return true
 }
 await reply(formatStatus(await status(sender)))
 return true
}
async function broadcast(sock,groups,text){
 for(const group of groups){
  if(!group.chat_jid?.endsWith('@g.us'))continue
  const result=await Promise.race([
   sock.sendMessage(group.chat_jid,{text}).then(()=>true).catch(()=>false),
   delay(3000).then(()=>false)
  ])
  if(!result)console.warn('[HALLOWEEN] aviso não confirmado',group.chat_jid)
 }
}
async function claimNotice(key){
 const r=await db.query(`INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)
   ON CONFLICT(key) DO NOTHING RETURNING key`,[key,JSON.stringify({sentAt:Date.now()})])
 return Boolean(r.rowCount)
}
export function scheduleHalloweenAlpha(sock,listGroups,{isConnected=()=>true}={}){
 if(scheduler)return
 let ticks=0
 scheduler=setInterval(async()=>{
  if(running)return
  running=true
  try{
   const now=Date.now()
   if(now>=HALLOWEEN_SHOP_END){clearInterval(scheduler);scheduler=null;return}
   if(!isConnected())return
   const boss=halloweenBoss(now)
   if(boss){
    if(await claimNotice('halloween_day_20261026:'+boss.day)){
     const groups=await listGroups()
     await broadcast(sock,groups,'🎃👹 *HALLOWEEN ALPHA — '+boss.name+'*\n⏰ Boss global até 23h59, ataques automáticos a cada 10 segundos!\n❤️ HP inicial: *'+fmt(boss.hp)+'*\n💀 3 fases e renascimento após derrota.\n🧩 Almas ilimitadas, 2× XP personagem/pet e quatro itens lendários raros.\n👉 Digite *!halloween entrar* para participar.\n🐎 Trocas pelo Corcel Espectral abrem sábado.')
    }
    const alerts=await tickHalloween()
    for(const a of alerts){
     if(a.type==='defeated'){
      const key='halloween_win:'+boss.day+':'+a.cycle
      if(await claimNotice(key)){
       const groups=await listGroups()
       const ranking=a.ranking.slice(0,5).map((p,i)=>(i===0?'🥇':i===1?'🥈':'🏅')+' '+p.name+': '+fmt(p.damage)+' dano').join('\n')
       const drops=a.drops.map(p=>'🎁 '+p.name+': '+p.items.join(', ')).join('\n')
       await broadcast(sock,groups,'🎃⚔️ *'+boss.name+' DERROTADO!*\n🏆 Ciclo '+a.cycle+'\n'+(ranking||'Sem participantes elegíveis.')+'\n'+(drops?'\n🌟 *DROPS RAROS*\n'+drops:'')+'\n🧩 Almas e XP creditados aos elegíveis.\n👻 O Boss renasce em 2 minutos.')
      }
     }
    }
    ticks++
    if(ticks%180===0){
     const key='halloween_progress:'+boss.day+':'+Math.floor(now/1800000)
     const st=(await db.query('SELECT hp,max_hp,cycle FROM halloween_boss_days_2026 WHERE day=$1',[boss.day])).rows[0]
     const players=(await db.query('SELECT name,day_damage FROM halloween_players_2026 WHERE active=TRUE ORDER BY day_damage DESC LIMIT 5')).rows
     if(st&&players.length&&await claimNotice(key)){
      const groups=await listGroups()
      await broadcast(sock,groups,'🎃 *HALLOWEEN — BOLETIM 30 MIN*\n👹 '+boss.name+' • Ciclo '+st.cycle+'\n❤️ '+fmt(st.hp)+'/'+fmt(st.max_hp)+' HP\n'+players.map((p,i)=>(i+1)+'. '+p.name+' — '+fmt(p.day_damage)+' dano').join('\n')+'\n🧩 Sem limite de farm. *!halloween status*')
     }
    }
   }
  }catch(e){console.error('[HALLOWEEN] tick',e?.stack||e)}
  finally{running=false}
 },ATTACK_MS)
 scheduler.unref?.()
 void Promise.resolve().then(()=>console.log('[HALLOWEEN] scheduler 10s ativo; início 26/10 até 31/10'))
}
