import {playableHero,heroCombatStats,heroEffectiveCombatHp,heroCollabGearBonus,heroAttack,heroDefense,persistHeroHpDelta} from './playable-heroes-core.js'

// O primeiro ataque fixa a identidade do heroi; todo acesso usa a transacao da acao.
export async function readBossCombatHero(client,jid,stats,prior={},gearHp=0){
 const pinned=Object.hasOwn(prior,'heroId')
 let heroId=pinned?prior.heroId:null
 if(!pinned){
  const r=await client.query('SELECT m.hero_species FROM player_hero_mode m WHERE m.jid=$1 AND m.hero_species IS NOT NULL AND EXISTS(SELECT 1 FROM pet_collection p WHERE p.jid=m.jid AND p.species=m.hero_species)',[jid])
  heroId=r.rows[0]?.hero_species||null
 }
 if(!playableHero(heroId))return null
 const owned=await client.query('SELECT MAX(level)::int AS level FROM pet_collection WHERE jid=$1 AND species=$2',[jid,heroId])
 if(!Number(owned.rows[0]?.level||0))return null
 const level=Math.max(1,Math.min(100,Number(owned.rows[0].level)))
 let stage=Number(prior.heroMasteryStage||0)
 if(!pinned||!stage){
  const mastery=await client.query('SELECT stage FROM player_hero_mastery_unlocks WHERE jid=$1 AND hero_species=$2',[jid,heroId])
  stage=Number(mastery.rows[0]?.stage||1)
 }
 const heroMasteryStage=Math.max(1,Math.min(5,stage))
 const heroStats=heroCombatStats(stats,heroId,level)
 if(!heroStats)return null
 const combatMaxHp=Math.max(1,Number(heroStats.maxHp)+Number(gearHp||0))
 const persistentMaxHp=Math.max(1,Number(stats.max_hp)+Number(gearHp||0))
 const sourceMatches=Number(prior.heroStoredHp)===Number(stats.hp)&&
  Number(prior.heroPersistentMaxHp)===persistentMaxHp&&
  Number(prior.heroCombatMaxHp)===Number(heroStats.maxHp)
 const hp=sourceMatches&&Number.isFinite(Number(prior.heroLastHp))
  ?Math.min(combatMaxHp,Math.max(0,Number(prior.heroLastHp)))
  :heroEffectiveCombatHp(stats,heroStats,gearHp)
 return {
  heroId,heroLevel:level,heroMasteryStage,heroStats,
  heroGear:heroCollabGearBonus(heroId,stats.weapon_id,stats.armor_id,'boss'),
  hp,maxHp:combatMaxHp,heroPersistentMaxHp:persistentMaxHp,
  heroStoredHp:Number(stats.hp),heroLastHp:hp,
  heroHpRemainder:sourceMatches?Number(prior.heroHpRemainder||0):0,
  heroState:{...(sourceMatches?prior.heroState||{}:{})}
 }
}

export function bossHeroAttack(hero,damage,attackIndex){
 if(!hero)return null
 return heroAttack({heroId:hero.heroId,damage,hp:hero.hp,maxHp:hero.maxHp,
  attackIndex,context:'boss',state:hero.heroState,
  masteryStage:hero.heroMasteryStage,gear:hero.heroGear})
}
export function bossHeroDefense(hero,damage,state){
 if(!hero)return null
 return heroDefense({heroId:hero.heroId,damage,state,gear:hero.heroGear})
}
export function settleBossHeroHp(hero,participant,currentCombatHp){
 if(!hero)return null
 const resolved=persistHeroHpDelta({
  previousPersistentHp:hero.heroStoredHp,
  previousCombatHp:hero.heroLastHp,currentCombatHp,
  combatMaxHp:hero.maxHp,persistentMaxHp:hero.heroPersistentMaxHp,
  remainder:hero.heroHpRemainder
 })
 participant.heroStoredHp=resolved.hp
 participant.heroLastHp=currentCombatHp
 participant.heroHpRemainder=resolved.remainder
 participant.heroCombatMaxHp=hero.heroStats.maxHp
 participant.heroPersistentMaxHp=hero.heroPersistentMaxHp
 return resolved.hp
}
