import {db,ensureUser} from './db.js'
import {PECADOS_HEROES} from './sete-pecados-catalog.js'
import {playableHero,heroMasteryStage} from './playable-heroes-core.js'

const NOW='EXTRACT(EPOCH FROM NOW())::BIGINT'
async function transaction(fn){
  const c=await db.connect()
  try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}
  catch(err){await c.query('ROLLBACK');throw err}
  finally{c.release()}
}
export async function initPlayableHeroes(){
  await db.query(`CREATE TABLE IF NOT EXISTS player_hero_mode(
    jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    hero_species TEXT,
    updated_at BIGINT NOT NULL DEFAULT (${NOW})
  );
  CREATE TABLE IF NOT EXISTS player_hero_mastery(
    jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    hero_species TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0),
    updated_at BIGINT NOT NULL DEFAULT (${NOW}),
    PRIMARY KEY(jid,hero_species)
  );
  CREATE TABLE IF NOT EXISTS hero_mastery_awards(
    jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    award_key TEXT NOT NULL,
    hero_species TEXT NOT NULL,
    xp INTEGER NOT NULL CHECK(xp>0),
    created_at BIGINT NOT NULL DEFAULT (${NOW}),
    PRIMARY KEY(jid,award_key)
  )`)
}

export async function getActivePlayableHero(client,jid){
  const q=client||db
  const r=await q.query(`
    SELECT m.hero_species FROM player_hero_mode m
    WHERE m.jid=$1 AND m.hero_species IS NOT NULL
      AND EXISTS(SELECT 1 FROM pet_collection p WHERE p.jid=m.jid AND p.species=m.hero_species)`,[jid])
  return playableHero(r.rows[0]?.hero_species)?.species||null
}

export async function getPlayableHeroMasteryStage(client,jid,heroId){
  if(!playableHero(heroId))return 0
  const {rows}=await (client||db).query(
    'SELECT xp FROM player_hero_mastery WHERE jid=$1 AND hero_species=$2',[jid,heroId])
  return heroMasteryStage(Number(rows[0]?.xp||0))
}

export async function listPlayableHeroes(jid){
  await ensureUser(jid)
  const [owned,mode,mastery]=await Promise.all([
    db.query('SELECT species,MAX(level)::int AS level,COUNT(*)::int AS copies FROM pet_collection WHERE jid=$1 AND species=ANY($2::text[]) GROUP BY species',[jid,PECADOS_HEROES.map(h=>h.species)]),
    db.query('SELECT hero_species FROM player_hero_mode WHERE jid=$1',[jid]),
    db.query('SELECT hero_species,xp FROM player_hero_mastery WHERE jid=$1',[jid])
  ])
  const active=mode.rows[0]?.hero_species||null
  return PECADOS_HEROES.map(h=>{
    const pet=owned.rows.find(p=>p.species===h.species)
    const masteryXp=Number(mastery.rows.find(p=>p.hero_species===h.species)?.xp||0)
    return {id:h.species,name:h.name,owned:Boolean(pet),petLevel:Number(pet?.level||0),
      copies:Number(pet?.copies||0),masteryXp,masteryStage:heroMasteryStage(masteryXp),
      active:h.species===active&&Boolean(pet)}
  })
}

export async function setPlayableHeroMode(jid,heroId=null){
  await ensureUser(jid)
  const species=heroId==null||heroId==='class'?null:String(heroId||'').trim().toLowerCase()
  if(species&&!playableHero(species))throw new Error('Herói inválido. Use !heroi para ver os sete Pecados.')
  return transaction(async c=>{
    await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
    // Congele a identidade do combatente durante Raid/Boss automático. Não
    // deixe o jogador reiniciar cooldowns do herói em sessões já ativas.
    const raid=await c.query(`SELECT 1 FROM trevo_games
      WHERE game_type LIKE 'raid%' AND state->>'status'='active'
        AND COALESCE(state->'players','{}'::jsonb) ? $1 LIMIT 1`,[jid])
    const boss=await c.query(`SELECT 1 FROM boss_auto_sessions WHERE jid=$1
      AND status='active' AND (ends_at>$2 OR last_attack_at>$3) LIMIT 1`,
      [jid,Date.now(),Date.now()-60000])
    if(raid.rowCount||boss.rowCount)throw new Error('Você está em combate ativo. Aguarde terminar para trocar de personagem.')
    if(species){
      const pet=await c.query('SELECT id FROM pet_collection WHERE jid=$1 AND species=$2 ORDER BY level DESC,id LIMIT 1 FOR UPDATE',[jid,species])
      if(!pet.rowCount)throw new Error('Você ainda não desbloqueou esse Pecado. Abra baús da colaboração para conquistá-lo.')
    }
    const previous=(await c.query('SELECT hero_species FROM player_hero_mode WHERE jid=$1 FOR UPDATE',[jid])).rows[0]?.hero_species||null
    if(previous===species)return {unchanged:true,active:species,hero:playableHero(species)}
    await c.query(`INSERT INTO player_hero_mode(jid,hero_species,updated_at)
      VALUES($1,$2,${NOW}) ON CONFLICT(jid) DO UPDATE
      SET hero_species=EXCLUDED.hero_species,updated_at=EXCLUDED.updated_at`,[jid,species])
    // Nenhum UPDATE/DELETE em pets, classe, stats, pet_team ou awakening.
    // Pet de mesma especie e suprimido apenas no snapshot de combate.
    return {unchanged:false,active:species,hero:playableHero(species)}
  })
}

export async function awardPlayableHeroMastery(client,{jid,heroId,awardKey,xp=10}={}){
  if(!client||!jid||!playableHero(heroId)||!awardKey)return false
  // Limite compartilhado entre Raids e Bosses: 100 XP de maestria/dia por herói.
  // A trava no usuário serializa premiações simultâneas de grupos diferentes.
  await client.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const {rows:today}=await client.query(`SELECT COALESCE(SUM(xp),0)::int AS gained
    FROM hero_mastery_awards
    WHERE jid=$1 AND hero_species=$2
      AND (to_timestamp(created_at) AT TIME ZONE 'America/Sao_Paulo')::date =
          (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,[jid,heroId])
  const quota=Math.max(0,100-Number(today[0]?.gained||0))
  if(!quota)return false
  const amount=Math.min(quota,Math.max(1,Math.min(100,Math.floor(Number(xp)||10))))
  const saved=await client.query(`INSERT INTO hero_mastery_awards(jid,award_key,hero_species,xp)
    VALUES($1,$2,$3,$4) ON CONFLICT(jid,award_key) DO NOTHING RETURNING jid`,
    [jid,String(awardKey),heroId,amount])
  if(!saved.rowCount)return false
  await client.query(`INSERT INTO player_hero_mastery(jid,hero_species,xp,updated_at)
    VALUES($1,$2,$3,${NOW}) ON CONFLICT(jid,hero_species) DO UPDATE
    SET xp=LEAST(1300,player_hero_mastery.xp+EXCLUDED.xp),updated_at=EXCLUDED.updated_at`,
    [jid,heroId,amount])
  return true
}

export async function handlePlayableHeroCommand({cmd,args=[],sender,reply}={}){
  if(!['heroi','herois','herói','heroes'].includes(String(cmd||'')))return false
  const action=String(args[0]||'').trim().toLowerCase()
  if(!action||action==='status'||action==='lista'||action==='maestria'){
    const list=await listPlayableHeroes(sender)
    const active=list.find(h=>h.active)
    const rows=list.map(h=>`${h.owned?'✅':'🔒'} *${h.name}* — ${h.owned?`Pet Nv.${h.petLevel} • Maestria ${h.masteryStage}/5 (${h.masteryXp} XP)`:'não obtido'}${h.active?' • ⚔️ ATIVO':''}`)
    await reply('🌈⚔️ *HERÓIS JOGÁVEIS — 7 PECADOS*\n\n'+rows.join('\n')+
      '\n\n🧙 Classe tradicional preservada.\n⚔️ Combatente: *'+(active?.name||'sua classe')+'*\n'+
      '👉 *!heroi usar escanor* • *!heroi classe*\n'+
      '🐾 Seu pet permanece na coleção. O mesmo Pecado não participa como pet e herói no mesmo combate.')
    return true
  }
  const raw=action==='usar'?String(args[1]||'').trim().toLowerCase():action
  if(['classe','class','voltar'].includes(raw)){
    const saved=await setPlayableHeroMode(sender,null)
    await reply(saved.unchanged?'🧙 Sua classe já está ativa.':'🧙 Você voltou à sua classe original. Despertares, pets e inventário permanecem intactos.')
    return true
  }
  const hero=PECADOS_HEROES.find(x=>x.name.toLowerCase()===raw||x.species===raw||x.species==='pecado_'+raw)
  if(!hero){await reply('❌ Herói não encontrado. Use *!heroi* para consultar a coleção.');return true}
  const saved=await setPlayableHeroMode(sender,hero.species)
  await reply(saved.unchanged?'⚔️ '+hero.name+' já é seu combatente.':
    '🌈⚔️ *'+hero.name.toUpperCase()+' SELECIONADO!*\n\nEle substitui as habilidades da classe em Bosses/Raids, sem apagar seu Despertar ou seus pets.\nUse *!heroi classe* para voltar.')
  return true
}
