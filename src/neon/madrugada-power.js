// Snapshot isolado para o Boss das 03:33; não altera registros do Halloween.
import {equipmentStatsAtLevel,getEquipmentStarLevels,petTeamSynergy} from './db.js'
import {petCombatSpecialty} from './game-catalog.js'
import {profileCombatPetBonuses} from './games.js'
import {getEquippedEnchants} from './enchantments-alpha.js'
import {activeRelic} from './relics.js'

export async function madrugadaPower(c,jid){
 const st=(await c.query('SELECT atk,spd,weapon_id,armor_id,boot_id,helmet_id FROM stats WHERE jid=$1',[jid])).rows[0]
 if(!st)return {power:1,speed:100,crit:.10}
 const ids=[st.weapon_id,st.armor_id,st.boot_id,st.helmet_id].filter(Boolean)
 const upgrades=ids.length?(await c.query('SELECT item_id,level FROM equipment_upgrades WHERE jid=$1 AND item_id=ANY($2::text[])',[jid,ids])).rows:[]
 const levels=Object.fromEntries(upgrades.map(p=>[p.item_id,Number(p.level)||1]))
 const stars=await getEquipmentStarLevels(jid,ids,c)
 const ench=await getEquippedEnchants(c,jid,ids)
 let atk=Number(st.atk||0)+Number(ench.atk||0)
 let spd=Number(st.spd||0)+Number(ench.spd||0)
 let gearCrit=0
 for(const id of ids){
  const item=equipmentStatsAtLevel(id,levels[id]||1,stars[id]||1)
  atk+=Number(item?.atk||0)
  spd+=Number(item?.spd||0)
  gearCrit+=Number(item?.crit||0)
 }
 const pets=(await c.query('SELECT p.species,p.level,p.hp,p.energy,t.slot FROM pet_team t JOIN pet_collection p ON p.id=t.pet_id WHERE t.jid=$1 AND t.slot IN (1,2,3) ORDER BY t.slot',[jid])).rows
 const synergy=petTeamSynergy(pets)||{}
 const primary=pets.find(p=>Number(p.slot)===1)||null
 const bonuses=profileCombatPetBonuses(primary,pets)
 const active=pets.find(p=>Number(p.slot)===Number(bonuses.activeSlot))||null
 const petBonus=bonuses.active||{}
 spd+=Number(synergy.speed||0)+(active?Number(petCombatSpecialty(active.species).speed||0):0)
 const relic=await activeRelic(c,jid)
 const crit=Math.min(.45,Math.max(0,.10+gearCrit+Number(ench.crit||0)+Number(petBonus.crit||0)+Number(synergy.crit||0)+Number(relic?.bossCrit||0)))
 const mult=1+Math.min(.30,Number(petBonus.damage||0))+Math.max(0,Number(synergy.attack||0))+Math.max(0,Number(ench.damage||0))+Math.max(0,Number(relic?.boss||0))
 return {
  power:Math.max(1,Math.round(atk*(1+Number(ench.attackPct||0))*mult)),
  speed:Math.max(0,Math.floor(spd)),crit
 }
}