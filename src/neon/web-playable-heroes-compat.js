// Isolated Render Web API compatibility bridge for the already-migrated playable heroes.
// Keep the WhatsApp process and persistent class / awakening / pet state untouched.
import {db} from './db.js';
import {PECADOS_HEROES} from './sete-pecados-catalog.js';
import {
  playableHero, heroCombatSheetFromProfile, heroCollabGearBonus
} from './playable-heroes-core.js';

const HERO_IDS=PECADOS_HEROES.map(hero=>hero.species);
const asNumber=value=>Number(value)||0;

export async function webPlayableHeroesSnapshot(jid,combatProfile){
  // These tables are owned and migrated by the current WhatsApp runtime.
  // The Web API only reads them; it must never attempt a legacy migration.
  const [owned,mode,mastery]=await Promise.all([
    db.query(
      'SELECT species,MAX(level)::int AS level,MAX(xp)::int AS xp,COUNT(*)::int AS copies FROM pet_collection WHERE jid=$1 AND species=ANY($2::text[]) GROUP BY species',
      [jid,HERO_IDS]
    ),
    db.query('SELECT hero_species FROM player_hero_mode WHERE jid=$1',[jid]),
    db.query(
      'SELECT m.hero_species,m.xp,COALESCE(u.stage,1)::int AS stage FROM player_hero_mastery m LEFT JOIN player_hero_mastery_unlocks u ON u.jid=m.jid AND u.hero_species=m.hero_species WHERE m.jid=$1',
      [jid]
    )
  ]);
  const ownedById=new Map(owned.rows.map(p=>[p.species,p]));
  const masteryById=new Map(mastery.rows.map(p=>[p.hero_species,p]));
  const activeId=String(mode.rows[0]?.hero_species||'');
  const heroes=PECADOS_HEROES.map(hero=>{
    const pet=ownedById.get(hero.species);
    const m=masteryById.get(hero.species);
    return {
      id:hero.species,name:hero.name,owned:Boolean(pet),
      petLevel:pet?Math.max(1,Math.min(100,asNumber(pet.level))):0,
      petXp:asNumber(pet?.xp),copies:asNumber(pet?.copies),
      masteryXp:asNumber(m?.xp),masteryStage:Math.max(1,Math.min(5,asNumber(m?.stage)||1)),
      active:Boolean(pet)&&hero.species===activeId
    };
  });
  const active=heroes.find(h=>h.active)||null;
  const sheet=active&&combatProfile
    ?heroCombatSheetFromProfile(combatProfile,active.id,active.petLevel):null;
  const activeHeroCombat=sheet?{
    ...sheet,
    heroLevel:active.petLevel,
    masteryXp:active.masteryXp,
    masteryStage:active.masteryStage,
    collabPvP:heroCollabGearBonus(active.id,combatProfile.weapon_id,combatProfile.armor_id,'pvp'),
    collabRaid:heroCollabGearBonus(active.id,combatProfile.weapon_id,combatProfile.armor_id,'raid')
  }:null;
  return {heroes,activeHeroCombat,activeHeroId:active?.id||null};
}

export async function selectWebPlayableHero(jid,heroId=null){
  const species=heroId==null||heroId==='class'?null:String(heroId||'').trim().toLowerCase();
  if(species&&!playableHero(species))throw Error('Herói inválido.');
  const c=await db.connect();
  try{
    await c.query('BEGIN');
    const user=await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid]);
    if(!user.rowCount)throw Error('Jogador não encontrado.');
    // Use the same safety locks/conditions as the WhatsApp hero selector.
    const raid=await c.query(
      "SELECT 1 FROM trevo_games WHERE game_type LIKE 'raid%' AND state->>'status'='active' AND COALESCE(state->'players','{}'::jsonb) ? $1 LIMIT 1",
      [jid]
    );
    const boss=await c.query(
      "SELECT 1 FROM boss_auto_sessions WHERE jid=$1 AND status='active' AND (ends_at>$2 OR last_attack_at>$3) LIMIT 1",
      [jid,Date.now(),Date.now()-60000]
    );
    if(raid.rowCount||boss.rowCount)throw Error('Você está em combate ativo. Aguarde terminar para trocar de personagem.');
    if(species){
      const owned=await c.query(
        'SELECT id FROM pet_collection WHERE jid=$1 AND species=$2 ORDER BY level DESC,id LIMIT 1 FOR UPDATE',
        [jid,species]
      );
      if(!owned.rowCount)throw Error('Você ainda não desbloqueou esse Pecado.');
    }
    const old=await c.query('SELECT hero_species FROM player_hero_mode WHERE jid=$1 FOR UPDATE',[jid]);
    const previous=old.rows[0]?.hero_species||null;
    if(previous===species){
      await c.query('COMMIT');
      return {unchanged:true,active:species,hero:playableHero(species)};
    }
    await c.query(
      'INSERT INTO player_hero_mode(jid,hero_species,updated_at) VALUES($1,$2,EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(jid) DO UPDATE SET hero_species=EXCLUDED.hero_species,updated_at=EXCLUDED.updated_at',
      [jid,species]
    );
    await c.query('COMMIT');
    return {unchanged:false,active:species,hero:playableHero(species)};
  }catch(error){
    await c.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{
    c.release();
  }
}
