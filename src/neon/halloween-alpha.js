import {db,ensureUser,equipmentStatsAtLevel,getEquipmentStarLevels,petTeamSynergy,petMaxHp,petMaxEnergy,grantExpInTransaction} from './db.js'
import {petCombatSpecialty,classCritBonus,classAttack,classDefense} from './game-catalog.js'
import {getEquippedEnchants} from './enchantments-alpha.js'
import {profileCombatPetBonuses} from './games.js'
import {activeRelic} from './relics.js'
import {HALLOWEEN_TICK_MS,halloweenAttackInterval,halloweenAttackDue,halloweenNextAttackAt,halloweenOrderedAttackers} from './halloween-combat.js'
import {HALLOWEEN_START,HALLOWEEN_END,HALLOWEEN_SHOP_END,HALLOWEEN_SOUL_ID,HALLOWEEN_CORCEL,HALLOWEEN_CORCEL_COST,HALLOWEEN_GEAR,HALLOWEEN_BOSSES,halloweenBoss,halloweenActive,halloweenLocalDay,halloweenMinimumDamage,halloweenPhases,halloweenDropCatalog,halloweenMysticHelmetReduction} from './halloween-rules.js'
import {HALLOWEEN_SESSION_REMINDER_MS,HALLOWEEN_MAINTENANCE_MS,halloweenHourlyEnabled,halloweenSessionExpiry,halloweenSessionValid,halloweenSessionTime,halloweenSessionRemaining} from './halloween-session.js'
import {HALLOWEEN_ALTAR_OFFERS,HALLOWEEN_ALTAR_ITEMS,HALLOWEEN_CHEST_ID,HALLOWEEN_CHEST_CONTENTS,halloweenAltarOffer,halloweenAltarOpen,halloweenAltarCatalogText,halloweenTitleBonusXp,ownsHalloweenTitle} from './halloween-altar.js'

const fmt=n=>Math.floor(Number(n)||0).toLocaleString('pt-BR')
const nowSec=()=>Math.floor(Date.now()/1000)
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const ATTACK_MS=HALLOWEEN_TICK_MS
const REVIVE_MS=120000
const POWER_REFRESH_MS=10*60000
let scheduler=null
let running=false
let latestNotices=[]
let lastHourlyMaintenanceMinute=-1
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
  power INTEGER NOT NULL DEFAULT 0,defense INTEGER NOT NULL DEFAULT 0,mystic_guard REAL NOT NULL DEFAULT 0,
  power_refreshed BIGINT NOT NULL DEFAULT 0,last_attack BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  speed INTEGER NOT NULL DEFAULT 0,crit REAL NOT NULL DEFAULT 0,dodge REAL NOT NULL DEFAULT 0,
  mitigation REAL NOT NULL DEFAULT 0,effective_max_hp BIGINT NOT NULL DEFAULT 0,
  pet_active BOOLEAN NOT NULL DEFAULT FALSE,
  class_id TEXT NOT NULL DEFAULT 'warrior',class_applied BOOLEAN NOT NULL DEFAULT TRUE,
  awakening_stage INTEGER NOT NULL DEFAULT 0,awakening_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_proc_attack BIGINT NOT NULL DEFAULT 0,attempts BIGINT NOT NULL DEFAULT 0,
  boss_evades BIGINT NOT NULL DEFAULT 0,player_evades BIGINT NOT NULL DEFAULT 0,
  critical_hits BIGINT NOT NULL DEFAULT 0,
  lease_day TEXT NOT NULL DEFAULT '',lease_expires_at BIGINT NOT NULL DEFAULT 0,
  lease_notice_until BIGINT NOT NULL DEFAULT 0)`)
 // Migração aditiva: preserva golpes, dano, prêmios e pontuações do evento já iniciado.
 await db.query(`ALTER TABLE halloween_players_2026
  ADD COLUMN IF NOT EXISTS speed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crit REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dodge REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mitigation REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_max_hp BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pet_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS class_id TEXT NOT NULL DEFAULT 'warrior',
  ADD COLUMN IF NOT EXISTS class_applied BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS awakening_stage INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS awakening_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_proc_attack BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boss_evades BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player_evades BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critical_hits BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_day TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lease_expires_at BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_notice_until BIGINT NOT NULL DEFAULT 0`)
 await db.query('UPDATE halloween_players_2026 SET attempts=hits WHERE attempts<hits')
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
 // Registrar apenas os quatro itens novos. Nada altera preços/raridades dos
 // itens existentes nem publica o Altar antes de sábado.
 for(const item of HALLOWEEN_ALTAR_ITEMS){
  await db.query(`INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable)
   VALUES($1,$2,$3,'special',0,$4,FALSE,FALSE)
   ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,
    description=EXCLUDED.description,rarity=EXCLUDED.rarity,
    sellable=FALSE,stackable=FALSE`,[item.id,item.name,item.description,item.rarity])
 }
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
 const st=(await c.query('SELECT hp,max_hp,atk,def,spd,class_id,class_applied,weapon_id,armor_id,boot_id,helmet_id FROM stats WHERE jid=$1',[jid])).rows[0]
 if(!st)return {power:0,defense:0,mysticGuard:0,speed:100,crit:.10,dodge:0,mitigation:0,effectiveMaxHp:100,petActive:false,classId:'warrior',classApplied:false,awakeningStage:0}
 const ids=[st.weapon_id,st.armor_id,st.boot_id,st.helmet_id].filter(Boolean)
 const upgrades=ids.length?(await c.query('SELECT item_id,level FROM equipment_upgrades WHERE jid=$1 AND item_id=ANY($2::text[])',[jid,ids])).rows:[]
 const levels=Object.fromEntries(upgrades.map(r=>[r.item_id,Number(r.level)||1]))
 const stars=await getEquipmentStarLevels(jid,ids,c)
 const ench=await getEquippedEnchants(c,jid,ids)
 let atk=Number(st.atk||0)+Number(ench.atk||0)
 let defense=Number(st.def||0)+Number(ench.def||0)
 let speed=Number(st.spd||0)+Number(ench.spd||0)
 let equipmentHp=0,gearCrit=0
 for(const item of ids){
  const g=equipmentStatsAtLevel(item,levels[item]||1,stars[item]||1)
  atk+=Number(g?.atk||0)
  defense+=Number(g?.def||0)
  speed+=Number(g?.spd||0)
  gearCrit+=Number(g?.crit||0)
  if(item!==st.boot_id)equipmentHp+=Number(g?.hp||0)
 }
 const pets=(await c.query(`SELECT p.species,p.level,p.hp,p.energy,t.slot FROM pet_team t
 JOIN pet_collection p ON p.id=t.pet_id WHERE t.jid=$1 AND t.slot IN (1,2,3) ORDER BY t.slot`,[jid])).rows
 const synergy=petTeamSynergy(pets)||{}
 const primary=pets.find(p=>Number(p.slot)===1)||null
 const petBonuses=profileCombatPetBonuses(primary,pets)
 const activePet=pets.find(p=>Number(p.slot)===Number(petBonuses.activeSlot))||null
 const petBonus=petBonuses.active||{}
 speed+=Number(synergy.speed||0)+(activePet?Number(petCombatSpecialty(activePet.species).speed||0):0)
 const awakening=(await c.query('SELECT stage FROM player_awakenings WHERE jid=$1',[jid])).rows[0]
 const awakeningStage=Math.max(0,Number(awakening?.stage||0))
 const relic=await activeRelic(c,jid)
 const crit=Math.max(0,Math.min(.45,.10+gearCrit+Number(ench.crit||0)+Number(petBonus.crit||0)+Number(synergy.crit||0)+classCritBonus(st.class_id,st.class_applied,awakeningStage,'boss')+Number(relic?.bossCrit||0)))
 const atkWithSeal=Math.round(atk*(1+Number(ench.attackPct||0)))
 const multiplier=1+Math.min(.30,Number(petBonus.damage||0))+Math.max(0,Number(synergy.attack||0))+Math.max(0,Number(ench.damage||0))+Math.max(0,Number(relic?.boss||0))
 const power=Math.max(1,Math.round(atkWithSeal*multiplier))
 return {
  power,defense:Math.max(0,Math.floor(defense)),speed:Math.max(0,Math.floor(speed)),
  crit,dodge:Math.min(.20,Math.max(0,Number(petBonus.dodge||0))),
  mitigation:Math.min(.50,Math.max(0,Number(petBonus.defense||0)+Number(synergy.defense||0))),
  effectiveMaxHp:Math.max(1,Number(st.max_hp||100)+equipmentHp),
  petActive:Boolean(activePet),classId:String(st.class_id||'warrior'),
  classApplied:Boolean(st.class_applied),awakeningStage,
  mysticGuard:halloweenMysticHelmetReduction({helmetId:st.helmet_id,teamStyle:synergy.style,teamCount:pets.length})
 }
}
async function savePowerSnapshot(c,jid,snap,now){
 await c.query(`UPDATE halloween_players_2026 SET
  power=$1,defense=$2,mystic_guard=$3,power_refreshed=$4,
  speed=$5,crit=$6,dodge=$7,mitigation=$8,effective_max_hp=$9,pet_active=$10,
  class_id=$11,class_applied=$12,awakening_stage=$13
  WHERE jid=$14`,[
  snap.power,snap.defense,snap.mysticGuard,now,
  snap.speed,snap.crit,snap.dodge,snap.mitigation,snap.effectiveMaxHp,snap.petActive,
  snap.classId,snap.classApplied,snap.awakeningStage,jid
 ])
}
const reflectSnapshot=(row,snap,now)=>{
 Object.assign(row,{
  power:snap.power,defense:snap.defense,mystic_guard:snap.mysticGuard,
  power_refreshed:now,speed:snap.speed,crit:snap.crit,dodge:snap.dodge,
  mitigation:snap.mitigation,effective_max_hp:snap.effectiveMaxHp,pet_active:snap.petActive,
  class_id:snap.classId,class_applied:snap.classApplied,awakening_stage:snap.awakeningStage
 })
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
 const titleOwned=await ownsHalloweenTitle(c,player.jid)
 const playerXp=halloweenTitleBonusXp(kind==='kill'?7000:2400,titleOwned)
 const petGain=halloweenTitleBonusXp(kind==='kill'?1100:400,titleOwned)
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
 // Retaliação a cada 12 ACERTOS; esquivas do Boss não geram contra-ataque.
 if(Number(player.hits)%12!==0)return
 const st=(await c.query('SELECT hp,max_hp FROM stats WHERE jid=$1 FOR UPDATE',[player.jid])).rows[0]
 if(!st||Number(st.hp)<=0)return
 const maxHp=Math.max(1,Number(player.effective_max_hp||st.max_hp||100))
 const phaseAtk=Number(boss.atk)*(phase===3?1.40:phase===2?1.20:1)
 const damage=Math.max(8,Math.floor((phaseAtk-Number(player.defense||0)*.20)*.32*
  (1-Math.min(.50,Number(player.mitigation||0)))*
  (1-Math.min(.015,Number(player.mystic_guard||0)))))
 const petDodged=Math.random()<Math.min(.20,Math.max(0,Number(player.dodge||0)))
 const defense=petDodged
  ?{damage:0,dodged:true,awakeningState:player.awakening_state||{}}
  :classDefense({
   classId:player.class_id,applied:player.class_applied,damage,
   context:'boss',hp:st.hp,maxHp,awakeningStage:player.awakening_stage,
   awakeningState:player.awakening_state||{}
  })
 player.awakening_state=defense.awakeningState||{}
 await c.query('UPDATE halloween_players_2026 SET awakening_state=$2::jsonb WHERE jid=$1',
  [player.jid,JSON.stringify(player.awakening_state)])
 if(petDodged||defense.dodged){
  await c.query('UPDATE halloween_players_2026 SET player_evades=player_evades+1 WHERE jid=$1',[player.jid])
  return
 }
 let hp=Math.max(0,Number(st.hp)-Number(defense.damage||0)+Number(defense.healAfter||0))
 if(hp<=Math.max(20,maxHp*.23)){
  const potion=(await c.query(`SELECT quantity FROM inventories
   WHERE jid=$1 AND item_id='elixir_supremo' AND quantity>0 FOR UPDATE`,[player.jid])).rows[0]
  if(potion){
   await c.query(`UPDATE inventories SET quantity=quantity-1
    WHERE jid=$1 AND item_id='elixir_supremo' AND quantity>0`,[player.jid])
   hp=Math.min(maxHp,hp+900)
  }
 }
 await c.query('UPDATE stats SET hp=$1 WHERE jid=$2',[Math.min(hp,maxHp),player.jid])
 // Pet pode cair e usar poções próprias; não força gasto se esgotadas.
 const pet=(await c.query('SELECT hp,max_hp,energy FROM pets WHERE jid=$1 FOR UPDATE',[player.jid])).rows[0]
 if(!pet)return
 let petHp=Math.max(0,Number(pet.hp)-Math.round(damage*.5))
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
  const locked=await c.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',['halloween-global-20261026'])
  if(!locked.rows[0]?.locked)return []
  let state=await ensureDay(c,boss)
  const alerts=[]
  // A sessão do jogador precisa ser renovada de hora em hora a partir de 27/10.
  // Expiração é reforçada também no SELECT dos combatentes (imediata).
  // Avisos e limpeza no banco são executados apenas uma vez por minuto.
  if(halloweenHourlyEnabled(now)){
   const minute=Math.floor(now/HALLOWEEN_MAINTENANCE_MS)
   if(minute!==lastHourlyMaintenanceMinute){
    const ended=(await c.query(`UPDATE halloween_players_2026
     SET active=FALSE,last_attack=0,updated_at=$2
     WHERE active=TRUE AND (lease_day<>$1 OR lease_expires_at<=$2)
     RETURNING name,chat,lease_day,lease_expires_at`,[boss.day,now])).rows
    const soon=(await c.query(`UPDATE halloween_players_2026
     SET lease_notice_until=lease_expires_at
     WHERE active=TRUE AND lease_day=$1
       AND lease_expires_at>$2 AND lease_expires_at<=$2+$3
       AND lease_notice_until<>lease_expires_at
     RETURNING name,chat,lease_expires_at`,[boss.day,now,HALLOWEEN_SESSION_REMINDER_MS])).rows
    // A abertura do novo Boss já avisa a turma para entrar.
    for(const p of ended){
     if(p.lease_day===boss.day)alerts.push({type:'session_expired',chat:p.chat,name:p.name})
    }
    for(const p of soon)alerts.push({type:'session_warning',chat:p.chat,name:p.name,expiresAt:Number(p.lease_expires_at)})
    lastHourlyMaintenanceMinute=minute
   }
  }
  if(Number(state.hp)<=0){
   if(now<Number(state.revive_at||0))return alerts
   const cycle=Number(state.cycle)+1
   await c.query('UPDATE halloween_boss_days_2026 SET cycle=$2,hp=max_hp,revive_at=0,updated_at=$3 WHERE day=$1',[boss.day,cycle,now])
   await c.query('UPDATE halloween_players_2026 SET round_damage=0 WHERE active=TRUE')
   state={...state,cycle,hp:state.max_hp,revive_at:0}
   alerts.push({type:'respawn',boss:boss.name,cycle})
  }
  // Sem LIMIT por JID: participantes ativos não podem ser excluídos por posição na tabela.
  const players=(await c.query(halloweenHourlyEnabled(now)
    ? 'SELECT * FROM halloween_players_2026 WHERE active=TRUE AND lease_day=$1 AND lease_expires_at>$2 FOR UPDATE'
    : 'SELECT * FROM halloween_players_2026 WHERE active=TRUE FOR UPDATE',
    halloweenHourlyEnabled(now)?[boss.day,now]:[])).rows
  if(!players.length)return alerts
  for(const row of players){
   if(String(row.day)!==boss.day){
    await c.query('UPDATE halloween_players_2026 SET day=$1,day_damage=0,round_damage=0,power_refreshed=0 WHERE jid=$2',[boss.day,row.jid])
    row.day=boss.day;row.round_damage=0;row.day_damage=0;row.power_refreshed=0
   }
   if(now-Number(row.power_refreshed||0)>POWER_REFRESH_MS||Number(row.power||0)<=0||Number(row.speed||0)<=0){
    const snap=await snapshotPower(c,row.jid)
    await savePowerSnapshot(c,row.jid,snap,now)
    reflectSnapshot(row,snap,now)
   }
  }
  // Repartição em passes: uma oportunidade por jogador antes de qualquer golpe
  // extra concedido pela VEL. A ordem obedece vencimento, VEL e rodízio dos empates.
  const contenders=halloweenOrderedAttackers(players,now,Number(state.cycle))
   .map(row=>({row,due:halloweenAttackDue(now,row.last_attack,row.speed)}))
   .filter(e=>e.due.slots>0)
  let hp=Number(state.hp)
  const oldHp=hp
  let hitCount=0
  let attempts=0
  for(let pass=0;pass<2&&hp>0;pass++){
   for(const entry of contenders){
    if(hp<=0)break
    if(pass>=entry.due.slots)continue
    const row=entry.row
    // Condições são conferidas novamente para o segundo golpe no mesmo tick.
    // Uma esquiva do Boss consome o turno, mas não gera dano ou retaliação.
    const combat=(await c.query(`SELECT
     EXISTS(SELECT 1 FROM player_sleep WHERE jid=$1 AND ends_at>$2) AS sleeping,
     EXISTS(SELECT 1 FROM player_carpinar WHERE jid=$1 AND ends_at>$2) AS carpindo,
     (SELECT hp FROM stats WHERE jid=$1) AS current_hp,
     (SELECT hp FROM pets WHERE jid=$1) AS pet_hp`,[row.jid,nowSec()])).rows[0]
    if(combat?.sleeping||combat?.carpindo||Number(combat?.current_hp||0)<=0)continue
    const phase=halloweenPhases(hp,Number(state.max_hp))
    const critical=Math.random()<Math.min(.45,Math.max(0,Number(row.crit||0)))
    const evaded=boss.day==='2026-10-26'&&Math.random()<.07
    const petMod=row.pet_active?1:.87
    const raw=Math.max(1,Math.round(Number(row.power||1)*(critical?1.5:1)*
     (.85+Math.random()*.3)*damageModifier(boss,phase)*petMod))
    let hit=0,proc=Number(row.last_proc_attack||0)
    if(!evaded){
     const attack=classAttack({
      classId:row.class_id,applied:row.class_applied,
      damage:raw,critical,hp:combat.current_hp,maxHp:Number(row.effective_max_hp||100),
      attackIndex:Number(row.attempts||0)+1,context:'boss',
      lastProcAttack:proc,awakeningStage:row.awakening_stage,
      awakeningState:row.awakening_state||{}
     })
     proc=Number(attack.lastProcAttack||0)
     row.awakening_state=attack.awakeningState||{}
     hit=Math.min(hp,Math.max(1,Number(attack.damage)||1))
     if(Number(attack.heal||0)>0){
      await c.query('UPDATE stats SET hp=LEAST($2,hp+$3) WHERE jid=$1 AND hp>0',
       [row.jid,Number(row.effective_max_hp||100),Number(attack.heal)])
     }
    }
    attempts++
    row.attempts=Number(row.attempts||0)+1
    row.hits=Number(row.hits||0)+(hit>0?1:0)
    row.last_proc_attack=proc
    row.last_attack=halloweenNextAttackAt(now,Number(row.last_attack||0),entry.due.interval)
    if(hit>0){
     hp-=hit;hitCount++
     row.round_damage=Number(row.round_damage||0)+hit
     row.day_damage=Number(row.day_damage||0)+hit
    }
    await c.query(`UPDATE halloween_players_2026 SET
     attempts=attempts+1,boss_evades=boss_evades+$1,hits=hits+$2,
     critical_hits=critical_hits+$3,round_damage=round_damage+$4,
     day_damage=day_damage+$4,all_damage=all_damage+$4,
     last_attack=$5,updated_at=$6,last_proc_attack=$7,awakening_state=$8::jsonb
     WHERE jid=$9`,[
     evaded?1:0,hit>0?1:0,critical&&hit>0?1:0,hit,
     row.last_attack,now,proc,JSON.stringify(row.awakening_state||{}),row.jid
    ])
    if(hit>0)await applyRetaliation(c,row,boss,phase)
   }
  }
  if(!hitCount)return alerts
  await c.query('UPDATE halloween_boss_days_2026 SET hp=$2,updated_at=$3,revive_at=$4 WHERE day=$1',
   [boss.day,hp,now,hp===0?now+REVIVE_MS:0])
  const cycle=Number(state.cycle)
  const milestones=[.25,.50,.75,1]
  const crossed=milestones.filter(q=>oldHp>Number(state.max_hp)*(1-q)&&hp<=Number(state.max_hp)*(1-q))
  if(crossed.length||hp===0){
   const rows=(await c.query('SELECT * FROM halloween_players_2026 WHERE active=TRUE AND day=$1 AND round_damage>0 ORDER BY round_damage DESC FOR UPDATE',[boss.day])).rows
   for(const m of crossed){
    for(const p of rows)await milestoneReward(c,boss.day,cycle,p,Math.round(m*100),boss,'quarter')
   }
   if(hp===0){
    const ranking=[],drops=[]
    for(const p of rows){
     const win=await milestoneReward(c,boss.day,cycle,p,100,boss,'kill')
     if(win){
      ranking.push({name:p.name,damage:Number(p.round_damage),souls:win.qty})
      const items=await maybeDrop(c,p.jid,boss,cycle)
      if(items.length)drops.push({name:p.name,items})
     }
    }
    alerts.push({type:'defeated',boss:boss.name,cycle,ranking,drops})
    console.log('[HALLOWEEN] boss derrotado',JSON.stringify({day:boss.day,cycle,eligible:ranking.length,drops:drops.length,attempts}))
   }
  }
  return alerts
 })
}
// Resgates extras compartilham a mesma economia de Almas e são únicos
// por jogador. Lock no usuário serializa dois comandos simultâneos.
async function buyHalloweenAltarOffer(jid,offerId){
 const offer=HALLOWEEN_ALTAR_OFFERS[offerId]
 if(!offer)throw new Error('Recompensa inválida. Use !halloween loja.')
 if(!halloweenAltarOpen())throw new Error('O Altar das Almas abre em 31/10 às 00h e fecha 01/11 ao meio-dia (São Paulo).')
 return tx(async c=>{
  await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const rewardId='altar_'+offer.id+'_20261031'
  const claimed=await c.query(`INSERT INTO halloween_shop_2026(jid,reward_id,created_at)
    VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING reward_id`,[jid,rewardId,nowSec()])
  if(!claimed.rowCount)throw new Error('Você já resgatou '+offer.name+'. Limite: uma vez por jogador.')
  const spent=await c.query(`UPDATE inventories SET quantity=quantity-$3
    WHERE jid=$1 AND item_id=$2 AND quantity>=$3 RETURNING quantity`,
   [jid,HALLOWEEN_SOUL_ID,offer.cost])
  if(!spent.rowCount)throw new Error('Almas insuficientes para '+offer.name+'. São necessárias '+offer.cost+' Almas.')
  await credit(c,jid,offer.itemId,offer.quantity)
  await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
   VALUES($1,'halloween',0,'halloween_altar_redeem',$2)`,
   [jid,rewardId+'; '+offer.cost+' Almas; '+offer.itemId+' x'+offer.quantity])
  return {offer,remaining:Number(spent.rows[0].quantity)}
 })
}

// O baú comprado fica no inventário e pode ser aberto mesmo depois que a
// loja fecha. Conteúdo fixo garante transparência, sem prêmio duplicado.
async function openHalloweenSupremeChest(jid){
 return tx(async c=>{
  await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const used=await c.query(`UPDATE inventories SET quantity=quantity-1
   WHERE jid=$1 AND item_id=$2 AND quantity>0 RETURNING quantity`,[jid,HALLOWEEN_CHEST_ID])
  if(!used.rowCount)throw new Error('Você não possui um Baú Supremo de Halloween. Resgate-o no Altar no sábado.')
  for(const item of HALLOWEEN_CHEST_CONTENTS)await credit(c,jid,item.itemId,item.quantity)
  await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
   VALUES($1,'halloween',0,'halloween_supreme_chest_open',$2)`,[
    jid,'Halloween 2026; '+HALLOWEEN_CHEST_CONTENTS.map(item=>item.itemId+' x'+item.quantity).join('; ')
   ])
  return {contents:HALLOWEEN_CHEST_CONTENTS,remaining:Number(used.rows[0].quantity)}
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
 const day=halloweenLocalDay()
 const [p,inv,bs,earned,corcel]=await Promise.all([
 db.query('SELECT * FROM halloween_players_2026 WHERE jid=$1',[jid]),
 db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[jid,HALLOWEEN_SOUL_ID]),
 boss?db.query('SELECT cycle,hp,max_hp,revive_at FROM halloween_boss_days_2026 WHERE day=$1',[boss.day]):Promise.resolve({rows:[]}),
 db.query('SELECT COALESCE(SUM(amount),0) AS earned_today FROM halloween_rewards_2026 WHERE day=$1 AND jid=$2 AND item_id=$3',[day,jid,HALLOWEEN_SOUL_ID]),
 db.query('SELECT 1 FROM halloween_shop_2026 WHERE jid=$1 AND reward_id=$2',[jid,HALLOWEEN_CORCEL])
 ])
 return {
  boss,player:p.rows[0],souls:Number(inv.rows[0]?.quantity||0),
  soulsToday:Number(earned.rows[0]?.earned_today||0),
  corcelClaimed:Boolean(corcel.rowCount),state:bs.rows[0]||null
 }
}
function formatStatus(s){
 const now=Date.now()
 const eligible=halloweenSessionValid(s.player,now,s.boss?.day)
 const active=eligible?'✅ Combate automático ativado':'⏸️ Fora do combate'
 const state=s.state
 const speed=Math.max(0,Number(s.player?.speed||0))
 const interval=(halloweenAttackInterval(speed)/1000).toFixed(2).replace('.',',')
 const lease=halloweenHourlyEnabled(now)
  ?(eligible?'⏳ Sessão até *'+halloweenSessionTime(s.player?.lease_expires_at)+'* (faltam *'+halloweenSessionRemaining(s.player?.lease_expires_at,now)+' min*)'
    :'🔁 *Sessão encerrada ou não iniciada*: use *!halloween entrar* para ativar 60 minutos')
  :'📅 Amanhã (27/10), será necessário renovar com *!halloween entrar* a cada 1 hora.'
 return '🎃 *HALLOWEEN ALPHA — CAÇADA DAS ALMAS*\n'+
 (s.boss?'👹 *'+s.boss.name+'*\n🛡️ '+s.boss.mechanic+'\n❤️ HP: *'+fmt(state?.hp??s.boss.hp)+'/'+fmt(state?.max_hp??s.boss.hp)+'* • Ciclo '+Number(state?.cycle||1)+(Number(state?.revive_at)>Date.now()?' • Ressurge em breve':'')+'\n':'🏁 Bosses encerrados. A loja encerra domingo ao meio-dia.\n')+
 '⚔️ '+active+' • rodadas globais de *10 segundos*\n'+
 '🕒 '+lease+'\n'+
 '⚡ VEL: *'+fmt(speed)+'* • intervalo próprio: *'+interval+'s* (bônus limitado a +25% de frequência)\n'+
 '🎯 CRIT: *'+(Number(s.player?.crit||0)*100).toFixed(1).replace('.',',')+'%* • 🌀 Esquiva de pet: *'+(Number(s.player?.dodge||0)*100).toFixed(1).replace('.',',')+'%*\n'+
 '🥊 Golpes acertados: *'+fmt(s.player?.hits||0)+'* • Tentativas: *'+fmt(s.player?.attempts||0)+'*\n'+
 '👻 Esquivas do Boss: *'+fmt(s.player?.boss_evades||0)+'* • 🛡️ Suas esquivas: *'+fmt(s.player?.player_evades||0)+'*\n'+
 '🧩 Almas coletadas hoje: *'+fmt(s.soulsToday)+'* • Restantes no dia: *ilimitadas*\n'+
 '🎒 Seu saldo de Almas: *'+fmt(s.souls)+'*\n'+
 '✨ *2× XP* do personagem e do time pet nos marcos de vitória\n'+
 '📈 Seu dano total: *'+fmt(s.player?.all_damage||0)+'*\n'+
 '🐎 Corcel Espectral: '+(s.corcelClaimed?'✅ já resgatado':'faltam *'+fmt(Math.max(0,HALLOWEEN_CORCEL_COST-s.souls))+'* Almas ('+fmt(Math.min(s.souls,HALLOWEEN_CORCEL_COST))+'/'+fmt(HALLOWEEN_CORCEL_COST)+')')+' — trocas no sábado\n'+
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
   const current=(await c.query('SELECT chat,active,lease_day,lease_expires_at FROM halloween_players_2026 WHERE jid=$1 FOR UPDATE',[sender])).rows[0]
   const stamp=Date.now()
   const eligible=halloweenSessionValid(current,stamp,boss.day)
   if(eligible&&current.chat!==chat)throw new Error('Você já está atacando em outro grupo. Use o grupo original ou !halloween sair.')
   const snap=await snapshotPower(c,sender)
   await c.query(`INSERT INTO halloween_players_2026(jid,name,chat,day,power,defense,mystic_guard,power_refreshed,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$8,$7,$7)
    ON CONFLICT(jid) DO UPDATE SET name=EXCLUDED.name,chat=EXCLUDED.chat,active=TRUE,
    power=EXCLUDED.power,defense=EXCLUDED.defense,mystic_guard=EXCLUDED.mystic_guard,
    power_refreshed=EXCLUDED.power_refreshed,updated_at=EXCLUDED.updated_at`,
    [sender,name||'Jogador',chat,boss.day,snap.power,snap.defense,stamp,snap.mysticGuard])
   await savePowerSnapshot(c,sender,snap,stamp)
   const expiresAt=halloweenHourlyEnabled(stamp)?halloweenSessionExpiry(stamp):0
   await c.query(`UPDATE halloween_players_2026
    SET lease_day=$2,lease_expires_at=$3,lease_notice_until=0,
        last_attack=CASE WHEN $4 THEN 0 ELSE last_attack END
    WHERE jid=$1`,[sender,boss.day,expiresAt,!eligible])
   return {...snap,expiresAt,renewed:eligible}
  })
  await reply('🎃⚔️ *'+(saved.renewed?'HORA RENOVADA':'ENTROU NO HALLOWEEN')+'!*\n👹 '+boss.name+'\n⚔️ Rodadas automáticas a cada 10s; VEL dá prioridade e pode adiantar turnos.\n💥 Poder de ataque estimado: '+fmt(saved.power)+(saved.expiresAt?'\n⏳ Participação válida por *60 minutos*, até *'+halloweenSessionTime(saved.expiresAt)+'* (São Paulo).\n🔁 Depois, use *!halloween entrar* novamente para continuar.':'\n📅 A partir de 27/10, cada participação exigirá renovação de hora em hora.')+'\n🧩 Farm ilimitado por participação real.\n🛡️ Personagem e pet sofrem dano; poções e energéticos disponíveis podem ser usados automaticamente.\nUse *!halloween status* para acompanhar.')
  return true
 }
 if(['sair','parar'].includes(action)){
  await db.query('UPDATE halloween_players_2026 SET active=FALSE,lease_expires_at=0,lease_notice_until=0,last_attack=0,updated_at=$2 WHERE jid=$1',[sender,Date.now()])
  await reply('⏸️ Combate automático do Halloween pausado. Seus fragmentos, XP e pontos foram preservados.')
  return true
 }
 if(['atualizar','recalcular'].includes(action)){
  const r=await tx(async c=>{
   const snap=await snapshotPower(c,sender)
   await savePowerSnapshot(c,sender,snap,Date.now())
   return snap
  })
  await reply('⚔️ *ATRIBUTOS DO HALLOWEEN ATUALIZADOS*\n💥 Poder: '+fmt(r.power)+'\n⚡ VEL: '+fmt(r.speed)+' • Intervalo: '+(halloweenAttackInterval(r.speed)/1000).toFixed(2).replace('.',',')+'s\n🎯 CRIT: '+(r.crit*100).toFixed(1).replace('.',',')+'%\n🌀 Esquiva do pet: '+(r.dodge*100).toFixed(1).replace('.',',')+'%')
  return true
 }
 if(['abrir'].includes(action)){
  if(!['bau','baú','supremo'].includes(String(args[1]||'').toLowerCase())){
   await reply('🔮 Para abrir seu Baú Supremo de Halloween, use *!halloween abrir bau*.')
   return true
  }
  const reward=await openHalloweenSupremeChest(sender)
  await reply('🔮✨ *BAÚ SUPREMO DE HALLOWEEN ABERTO!*\n\n'+
   reward.contents.map(item=>'🎁 '+item.quantity+'× '+item.name).join('\n')+
   '\n\n🏆 Troféu exclusivo guardado no inventário!'+
   '\n📦 Para abrir as Caixas Lendárias e Épicas, use *!caixas*.')
  return true
 }
 if(['trocar','resgatar','comprar'].includes(action)){
  const requested=String(args[1]||'').toLowerCase()
  if(['corcel','cavalo','pet','corcel-espectral'].includes(requested)){
   const r=await buyCorcel(sender)
   await reply('🐎✨ *CORCEL ESPECTRAL RESGATADO!*\n✅ Pet lendário Místico adicionado à coleção. ID: *'+r.petId+'*\n🧩 Almas restantes: *'+fmt(r.remaining)+'*\n📜 Use *!meuspets* para localizar e *!equiparpet* para equipá-lo.')
   return true
  }
  const offer=halloweenAltarOffer(requested)
  if(!offer){
   await reply('🎃 Recompensa desconhecida. Confira as opções com *!halloween loja*.')
   return true
  }
  const result=await buyHalloweenAltarOffer(sender,offer.id)
  await reply('🎃✅ *RESGATE DO ALTAR CONCLUÍDO!*\n'+
   result.offer.name+'\n🧩 Custo: *'+fmt(result.offer.cost)+' Almas*'+
   '\n🧩 Saldo restante: *'+fmt(result.remaining)+'*'+
   '\n\n'+(offer.id==='caixa'?'🎁 A Caixa Lendária está no inventário. Abra em *!caixas*.':
    offer.id==='insignia'?'💀 Insígnia adquirida. Equipe em *!reliquias*; substitui a insígnia anterior, sem acumular.':
    offer.id==='titulo'?'👑 Título permanente adquirido: *+10% EXP em Boss/Raid para você e seus pets*, automaticamente. Consulte em *!perfil*.':
    '🔮 Baú guardado no inventário. Abra quando quiser com *!halloween abrir bau*.'))
  return true
 }
 if(['loja','altar'].includes(action)){
  const s=await status(sender)
  const base='🎃 *ALTAR DAS ALMAS — HALLOWEEN*\n🧩 Saldo: *'+fmt(s.souls)+'* Almas Amaldiçoadas\n\n🐎 *Corcel Espectral — 100 Almas*\n✨ Lendário Místico, 1 por jogador\n👉 *!halloween trocar corcel*'
  if(!halloweenAltarOpen()){
   await reply(base+'\n\n🎁 Os 2 elmos e 2 pares de botas são DROPS dos Bosses, não itens da loja.\n⏰ *Altar fechado*: abre 31/10 às 00h e encerra 01/11 às 12h (São Paulo).')
   return true
  }
  await reply(base+'\n\n'+halloweenAltarCatalogText()+
   '\n\n🔒 Resgates únicos por jogador; Almas e compras anteriores preservadas.'+
   '\n🎁 Os elmos e botas exclusivos continuam somente por DROP dos Bosses.'+
   '\n⏰ Loja aberta até *01/11 às 12h* (São Paulo).')
  return true
 }
 if(['ranking','top'].includes(action)){
  const r=await db.query(`SELECT name,day_damage,all_damage,hits,attempts,boss_evades,player_evades,speed
   FROM halloween_players_2026 ORDER BY all_damage DESC LIMIT 10`)
  await reply('🏆 *RANKING GLOBAL HALLOWEEN*\n\n'+
   (r.rows.length?r.rows.map((p,i)=>(i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅')+' '+p.name+
    ' — '+fmt(p.all_damage)+' dano • '+fmt(p.hits)+' acertos'+
    '\n   ⚡ '+fmt(p.speed)+' VEL • '+fmt(p.attempts)+' tentativas • '+fmt(p.boss_evades)+' esquivas do Boss').join('\n'):'Nenhum participante ainda.')+
   '\n\nℹ️ Acertos não incluem ataques esquivados. Mais VEL gera iniciativa e até 25% mais frequência.\n🧩 Almas creditadas diretamente no inventário por participação.')
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
    const groupsOpening=await listGroups()
    if(groupsOpening.length&&await claimNotice('halloween_day_20261026:'+boss.day)){
     const groups=groupsOpening
     await broadcast(sock,groups,'🎃👹 *HALLOWEEN ALPHA — '+boss.name+'*\n⏰ Boss global até 23h59!\n❤️ HP inicial: *'+fmt(boss.hp)+'*\n💀 3 fases e renascimento após derrota.\n🧩 Almas ilimitadas, 2× XP personagem/pet e quatro itens lendários raros.\n'+(halloweenHourlyEnabled(now)?'🔁 *NOVA REGRA: a cada 1 hora, confirme sua participação!*\n⚔️ Ataques automáticos só durante os 60 minutos após *!halloween entrar*.\n⌛ O bot avisa 5 minutos antes de acabar.':'⚔️ Hoje os ataques continuam automáticos; a renovação por hora começa amanhã.')+'\n👉 Digite *!halloween entrar* para participar.\n🐎 Trocas pelo Corcel Espectral abrem sábado.')
    }
    const alerts=await tickHalloween()
    // Uma mensagem consolidada por grupo e por minuto evita flood.
    const sessionGroups=new Map()
    for(const alert of alerts){
     if(!['session_warning','session_expired'].includes(alert.type))continue
     if(!String(alert.chat||'').endsWith('@g.us'))continue
     if(!sessionGroups.has(alert.chat))sessionGroups.set(alert.chat,{warning:[],expired:[]})
     const list=sessionGroups.get(alert.chat)
     if(alert.type==='session_warning')list.warning.push(alert)
     else list.expired.push(alert)
    }
    for(const [groupChat,notices] of sessionGroups){
     const warning=notices.warning.length?
      '⏳ *HALLOWEEN — FALTAM ATÉ 5 MINUTOS*\n'+
      notices.warning.map(p=>'• '+p.name+' — até '+halloweenSessionTime(p.expiresAt)).join('\n')+
      '\n🔁 Renovem com *!halloween entrar*.':null
     const expired=notices.expired.length?
      '⌛ *SESSÃO DE HALLOWEEN ENCERRADA*\n'+
      notices.expired.map(p=>'• '+p.name).join('\n')+
      '\n⚔️ Ataques pausados até *!halloween entrar*.':null
     const notice=[warning,expired].filter(Boolean).join('\n\n')
     if(notice){
      const ok=await Promise.race([
       sock.sendMessage(groupChat,{text:notice}).then(()=>true).catch(()=>false),
       delay(3000).then(()=>false)
      ])
      if(!ok)console.warn('[HALLOWEEN] aviso de sessão não confirmado',groupChat)
     }
    }
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
     const players=(await db.query(`SELECT p.name,p.day_damage,COALESCE(r.souls_today,0) AS souls_today
      FROM halloween_players_2026 p
      LEFT JOIN (
       SELECT jid,SUM(amount) AS souls_today FROM halloween_rewards_2026
       WHERE day=$1 AND item_id=$2 GROUP BY jid
      ) r ON r.jid=p.jid
      WHERE p.active=TRUE AND p.day=$1
      ORDER BY p.day_damage DESC LIMIT 5`,[boss.day,HALLOWEEN_SOUL_ID])).rows
     if(st&&players.length&&await claimNotice(key)){
      const groups=await listGroups()
      await broadcast(sock,groups,'🎃 *HALLOWEEN — BOLETIM 30 MIN*\n👹 '+boss.name+' • Ciclo '+st.cycle+'\n❤️ '+fmt(st.hp)+'/'+fmt(st.max_hp)+' HP\n'+players.map((p,i)=>(i+1)+'. '+p.name+' — '+fmt(p.day_damage)+' dano • 🧩 '+fmt(p.souls_today)+' Almas hoje').join('\n')+'\n🧩 Farm diário ilimitado. *!halloween status*')
     }
    }
   }
  }catch(e){console.error('[HALLOWEEN] tick',e?.stack||e)}
  finally{running=false}
 },ATTACK_MS)
 scheduler.unref?.()
 void Promise.resolve().then(()=>console.log('[HALLOWEEN] scheduler 10s ativo; início 26/10 até 31/10'))
}
