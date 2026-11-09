import {
 playableHero,heroCombatStats,heroEffectiveCombatHp,heroCollabGearBonus,
 heroAttack,excludeActiveHeroPet
} from './playable-heroes-core.js'

// Consulta estritamente transacional do herói selecionado. A identidade é
// validada na coleção; possuir outro herói não autoriza utilizar este.
export async function readRaidActiveHero(client,jid,stats,gearHp=0){
 const {rows:modes}=await client.query(`
  SELECT m.hero_species FROM player_hero_mode m
  WHERE m.jid=$1 AND m.hero_species IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM pet_collection p
      WHERE p.jid=m.jid AND p.species=m.hero_species
    )`,[jid])
 const heroId=playableHero(modes[0]?.hero_species)?.species||null
 if(!heroId)return null
 const [{rows:levels},{rows:stages}]=await Promise.all([
  client.query('SELECT MAX(level)::int AS level FROM pet_collection WHERE jid=$1 AND species=$2',[jid,heroId]),
  client.query('SELECT stage FROM player_hero_mastery_unlocks WHERE jid=$1 AND hero_species=$2',[jid,heroId])
 ])
 const heroLevel=Math.max(1,Math.min(100,Number(levels[0]?.level||1)))
 const heroMasteryStage=Math.max(1,Math.min(5,Number(stages[0]?.stage||1)))
 const heroStats=heroCombatStats(stats,heroId,heroLevel)
 if(!heroStats) return null
 const heroGear=heroCollabGearBonus(heroId,stats.weapon_id,stats.armor_id,'raid')
 const hp=heroEffectiveCombatHp(stats,heroStats,gearHp)
 return {heroId,heroLevel,heroMasteryStage,heroStats,heroGear,hp}
}

// Somente altera o snapshot da Raid salvo na transação ativa.
// Não altera stats, wallet, inventário, recompensas ou classe.
export function applyRaidHeroSnapshot(participant,hero,stats,gear,ench,gearHp){
 if(!hero)return participant
 const g=gear||{},e=ench||{}
 const equipmentAtk=Number(g.weapon?.atk||0)+Number(g.armor?.atk||0)+
  Number(g.boot?.atk||0)+Number(g.helmet?.atk||0)
 const equipmentDef=Number(g.weapon?.def||0)+Number(g.armor?.def||0)+
  Number(g.boot?.def||0)+Number(g.helmet?.def||0)
 const equipmentCrit=Number(g.weapon?.crit||0)+Number(g.armor?.crit||0)+
  Number(g.boot?.crit||0)+Number(g.helmet?.crit||0)
 const hp=Math.min(hero.heroStats.maxHp+gearHp,hero.hp)
 const heroSnapshot={
  hp,maxHp:hero.heroStats.maxHp+gearHp,
  atk:Math.round((Number(hero.heroStats.atk)+equipmentAtk+Number(e.atk||0))*(1+Number(e.attackPct||0))),
  def:Number(hero.heroStats.def)+equipmentDef+Number(e.def||0),
  classApplied:false,awakeningStage:0,
  crit:Math.max(0,.10+equipmentCrit+Number(e.crit||0)),
  heroId:hero.heroId,heroLevel:hero.heroLevel,
  heroMasteryStage:hero.heroMasteryStage,heroGear:hero.heroGear,
  heroState:{},heroAttacks:0,
  heroCombatMaxHp:hero.heroStats.maxHp,
  heroPersistentMaxHp:Number(stats.max_hp)+gearHp,
  heroStoredHp:Number(stats.hp),heroLastHp:hp,heroHpRemainder:0
 }
 return {...participant,...heroSnapshot}
}

// Não permite que um Pecado equipado como herói também participe como pet.
export function raidHeroPetSnapshot(hero,primary=null,reserve=null,team=[]){
 if(!hero)return {primary,reserve,team}
 const heroId=hero.heroId
 let active=primary?.species===heroId?null:primary
 let backup=reserve?.species===heroId?null:reserve
 if(!active&&backup){active=backup;backup=null}
 return {primary:active,reserve:backup,team:excludeActiveHeroPet(team,heroId)}
}

export function raidHeroRoundHit(participant,damage){
 if(!participant?.heroId)return null
 const attackIndex=Number(participant.heroAttacks||0)+1
 const hit=heroAttack({
  heroId:participant.heroId,damage,hp:participant.hp,maxHp:participant.maxHp,
  attackIndex,context:'raid',state:participant.heroState,
  masteryStage:participant.heroMasteryStage,gear:participant.heroGear
 })
 return {...hit,attackIndex}
}
