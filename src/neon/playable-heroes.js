import {db,ensureUser,getCombatProfile} from './db.js'
import {PECADOS_HEROES} from './sete-pecados-catalog.js'
import {playableHero,heroMasteryStage,HERO_SKILL_GUIDE,HERO_COMBAT_PROFILES,heroCombatSheetFromProfile,HERO_MASTERY_XP,HERO_MASTERY_COST,heroMasteryNext,heroCollabGearBonus,raid75MasteryBonusActive,heroMasteryAwardPolicy,heroLevelAwardPolicy} from './playable-heroes-core.js'
import {archiveSevenSinsPetAssignments} from './hero-only-pet-migration.js'

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
  CREATE TABLE IF NOT EXISTS player_hero_mastery_unlocks(
    jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    hero_species TEXT NOT NULL,
    stage INTEGER NOT NULL DEFAULT 1 CHECK(stage BETWEEN 1 AND 5),
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
    PRIMARY KEY(jid,hero_species)
  );
  CREATE TABLE IF NOT EXISTS hero_mastery_awards(
    jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    award_key TEXT NOT NULL,
    hero_species TEXT NOT NULL,
    xp INTEGER NOT NULL CHECK(xp>0),
    created_at BIGINT NOT NULL DEFAULT (${NOW}),
    PRIMARY KEY(jid,award_key)
  );
  CREATE TABLE IF NOT EXISTS hero_level_awards(
    jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    award_key TEXT NOT NULL,
    hero_species TEXT NOT NULL,
    xp INTEGER NOT NULL CHECK(xp>0),
    created_at BIGINT NOT NULL DEFAULT (${NOW}),
    PRIMARY KEY(jid,award_key)
  )`)
  const conversion=await archiveSevenSinsPetAssignments()
  if(conversion.migrated)console.info('[Heroes] converted legacy pet assignments:',conversion.migrated,'players; without eligible pet:',conversion.noEligiblePet)
}

export async function getActivePlayableHero(client,jid){
  const q=client||db
  const r=await q.query(`
    SELECT m.hero_species FROM player_hero_mode m
    WHERE m.jid=$1 AND m.hero_species IS NOT NULL
      AND EXISTS(SELECT 1 FROM pet_collection p WHERE p.jid=m.jid AND p.species=m.hero_species)`,[jid])
  return playableHero(r.rows[0]?.hero_species)?.species||null
}

export async function getPlayableHeroLevel(client,jid,heroId){
  if(!playableHero(heroId))return 1
  const {rows}=await (client||db).query(
    'SELECT MAX(level)::int AS level FROM pet_collection WHERE jid=$1 AND species=$2',[jid,heroId])
  return Math.max(1,Math.min(100,Number(rows[0]?.level||1)))
}

export async function getPlayableHeroMasteryStage(client,jid,heroId){
  if(!playableHero(heroId))return 0
  const {rows}=await (client||db).query(
    'SELECT stage FROM player_hero_mastery_unlocks WHERE jid=$1 AND hero_species=$2',[jid,heroId])
  return Math.max(1,Math.min(5,Number(rows[0]?.stage||1)))
}

// Somente leitura: o herói equipa o combatente de Boss/Raid sem alterar a classe.
export async function getPlayableHeroCombatSheet(jid,knownProfile=null){
  const heroId=await getActivePlayableHero(db,jid);
  if(!heroId)return null;
  const [profile,mastery,heroLevel]=await Promise.all([
    knownProfile||getCombatProfile(jid),
    db.query('SELECT xp FROM player_hero_mastery WHERE jid=$1 AND hero_species=$2',[jid,heroId]),
    getPlayableHeroLevel(db,jid,heroId)
  ]);
  const combat=heroCombatSheetFromProfile(profile,heroId,heroLevel);
  if(!combat)return null;
  const xp=Math.max(0,Number(mastery.rows[0]?.xp||0));
  const masteryStage=await getPlayableHeroMasteryStage(db,jid,heroId);
  const collabPvP=heroCollabGearBonus(heroId,profile.weapon_id,profile.armor_id,'pvp');
  const collabRaid=heroCollabGearBonus(heroId,profile.weapon_id,profile.armor_id,'raid');
  return {...combat,heroLevel,masteryXp:xp,masteryStage,collabPvP,collabRaid};
}

export function formatPlayableHeroCombatSheet(sheet){
  if(!sheet)return '';
  const gearBonuses=[
    sheet.collabPvP?.weapon
      ? '✅ Arma do personagem: *+1,5% dano PvP* e *+4% dano Boss/Raid*'+(sheet.heroId==='pecado_ban'?' • Ban recupera até 1% HP a cada 6 ataques PvP e +2% HP extra a cada 8 ataques Boss/Raid':'')
      : null,
    sheet.collabPvP?.armor
      ? '✅ Armadura do personagem: *-2% dano recebido PvP* e *-4% Boss/Raid*'
      : null
  ].filter(Boolean);
  const lines=[
    '🌈⚔️ *PERSONAGEM ATIVO — '+sheet.name.toUpperCase()+'*',
    '🎭 '+sheet.role+' • '+sheet.range,
    '🌟 Nível: *'+sheet.heroLevel+'/100*',
    '🏅 Maestria: *'+sheet.masteryStage+'/5* ('+sheet.masteryXp+' XP)',
    '❤️ HP: *'+sheet.hp+'/'+sheet.maxHp+'*',
    '⚔️ ATK: *'+sheet.atk+'*',
    '🛡️ DEF: *'+sheet.def+'*',
    '👢 VEL: *'+sheet.spd+'*',
    '✨ Técnica: *'+sheet.skill+'*'
  ];
  if(gearBonuses.length)lines.push(
    '🌈 *BÔNUS EXCLUSIVO DA COLLAB*',
    ...gearBonuses,
    '💡 Bônus especiais só funcionam com o personagem correspondente; os atributos normais do equipamento já estão somados acima.'
  );
  return lines.join('\n');
}

export async function listPlayableHeroes(jid){
  await ensureUser(jid)
  const [owned,mode,mastery]=await Promise.all([
    db.query('SELECT species,MAX(level)::int AS level,MAX(xp)::int AS xp,COUNT(*)::int AS copies FROM pet_collection WHERE jid=$1 AND species=ANY($2::text[]) GROUP BY species',[jid,PECADOS_HEROES.map(h=>h.species)]),
    db.query('SELECT hero_species FROM player_hero_mode WHERE jid=$1',[jid]),
    db.query('SELECT m.hero_species,m.xp,COALESCE(u.stage,1)::int AS stage FROM player_hero_mastery m LEFT JOIN player_hero_mastery_unlocks u ON u.jid=m.jid AND u.hero_species=m.hero_species WHERE m.jid=$1',[jid])
  ])
  const active=mode.rows[0]?.hero_species||null
  return PECADOS_HEROES.map(h=>{
    const pet=owned.rows.find(p=>p.species===h.species)
    const masteryXp=Number(mastery.rows.find(p=>p.hero_species===h.species)?.xp||0)
    return {id:h.species,name:h.name,owned:Boolean(pet),petLevel:Number(pet?.level||0),petXp:Number(pet?.xp||0),
      copies:Number(pet?.copies||0),masteryXp,masteryStage:Math.max(1,Number(mastery.rows.find(p=>p.hero_species===h.species)?.stage||1)),
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

// Crédito independente da maestria, por herói e evento, sem XP de pet comum.
export async function awardPlayableHeroLevel(client,{jid,heroId,awardKey,xp=55}={}){
  if(!client||!jid||!playableHero(heroId)||!awardKey)return false
  // A trava serializa Boss e Raid concorrentes para o mesmo jogador.
  await client.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const pet=(await client.query(
    'SELECT id,level,xp FROM pet_collection WHERE jid=$1 AND species=$2 ORDER BY level DESC,xp DESC,id ASC LIMIT 1 FOR UPDATE',
    [jid,heroId])).rows[0]
  if(!pet)return false
  const currentXp=Math.max(0,Math.min(9900,Number(pet.xp||0)))
  const effectiveXp=Math.max(currentXp,Math.min(9900,(Math.max(1,Number(pet.level||1))-1)*100))
  if(effectiveXp>=9900)return false
  const {rows:today}=await client.query(`SELECT COALESCE(SUM(xp),0)::int AS gained
    FROM hero_level_awards WHERE jid=$1 AND hero_species=$2
      AND (to_timestamp(created_at) AT TIME ZONE 'America/Sao_Paulo')::date =
          (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,[jid,heroId])
  const policy=heroLevelAwardPolicy({earnedToday:today[0]?.gained,currentXp:effectiveXp,xp})
  const amount=policy.amount
  if(!amount)return false
  const saved=await client.query(`INSERT INTO hero_level_awards(jid,award_key,hero_species,xp)
    VALUES($1,$2,$3,$4) ON CONFLICT(jid,award_key) DO NOTHING RETURNING jid`,
    [jid,String(awardKey),heroId,amount])
  if(!saved.rowCount)return false
  const nextXp=Math.min(9900,effectiveXp+amount)
  const nextLevel=Math.min(100,1+Math.floor(nextXp/100))
  await client.query('UPDATE pet_collection SET xp=$1,level=$2 WHERE id=$3 AND jid=$4',
    [nextXp,nextLevel,pet.id,jid])
  return true
}

export async function awardPlayableHeroMastery(client,{jid,heroId,awardKey,xp=90,specialRaid75=false}={}){
  if(!client||!jid||!playableHero(heroId)||!awardKey)return false
  // 400 XP/dia normal; até 600 combinados na semana especial da Raid 75.
  // Uma única trava por usuário evita ultrapassar a cota com Raid e Boss simultâneos.
  await client.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const {rows:today}=await client.query(`SELECT COALESCE(SUM(xp),0)::int AS gained,
    COALESCE(SUM(xp) FILTER (WHERE award_key NOT LIKE 'raid:75:%'),0)::int AS regular_gained
    FROM hero_mastery_awards
    WHERE jid=$1 AND hero_species=$2
      AND (to_timestamp(created_at) AT TIME ZONE 'America/Sao_Paulo')::date =
          (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,[jid,heroId])
  const bonus=Boolean(specialRaid75)&&String(awardKey).startsWith('raid:75:')&&
    raid75MasteryBonusActive({level:75,collab:true,nowMs:Date.now()})
  const policy=heroMasteryAwardPolicy({specialRaid75:bonus,
    earnedToday:today[0]?.gained,regularEarnedToday:today[0]?.regular_gained,xp})
  const amount=policy.amount
  if(!amount)return false
  const saved=await client.query(`INSERT INTO hero_mastery_awards(jid,award_key,hero_species,xp)
    VALUES($1,$2,$3,$4) ON CONFLICT(jid,award_key) DO NOTHING RETURNING jid`,
    [jid,String(awardKey),heroId,amount])
  if(!saved.rowCount)return false
  await client.query(`INSERT INTO player_hero_mastery(jid,hero_species,xp,updated_at)
    VALUES($1,$2,$3,${NOW}) ON CONFLICT(jid,hero_species) DO UPDATE
    SET xp=LEAST(7000,player_hero_mastery.xp+EXCLUDED.xp),updated_at=EXCLUDED.updated_at`,
    [jid,heroId,amount])
  return true
}


export async function evolvePlayableHeroMastery(jid,heroId){
  if(!playableHero(heroId))throw new Error('Personagem inválido.');
  await ensureUser(jid);
  return transaction(async c=>{
    await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid]);
    const owned=await c.query('SELECT 1 FROM pet_collection WHERE jid=$1 AND species=$2 LIMIT 1',[jid,heroId]);
    if(!owned.rowCount)throw new Error('Você ainda não conquistou esse personagem.');
    const [unlocks,xpResult]=await Promise.all([
      c.query('SELECT stage FROM player_hero_mastery_unlocks WHERE jid=$1 AND hero_species=$2 FOR UPDATE',[jid,heroId]),
      c.query('SELECT xp FROM player_hero_mastery WHERE jid=$1 AND hero_species=$2',[jid,heroId])
    ]);
    const stage=Math.max(1,Number(unlocks.rows[0]?.stage||1));
    const xp=Math.max(0,Number(xpResult.rows[0]?.xp||0));
    const next=heroMasteryNext(stage);
    if(!next)return {max:true,stage,xp};
    if(xp<next.xp)throw new Error('Maestria '+next.stage+' exige '+next.xp+' XP. Você possui '+xp+' XP.');
    const wallet=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0];
    const cash=Math.max(0,Number(wallet?.cash||0)),bank=Math.max(0,Number(wallet?.bank||0));
    if(!wallet||cash+bank<next.cost)throw new Error('Maestria '+next.stage+' custa R$ '+next.cost.toLocaleString('pt-BR')+'. Saldo insuficiente.');
    const debitCash=Math.min(cash,next.cost),debitBank=next.cost-debitCash;
    await c.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at='+NOW+' WHERE jid=$3',[debitCash,debitBank,jid]);
    await c.query('INSERT INTO player_hero_mastery_unlocks(jid,hero_species,stage,updated_at) VALUES($1,$2,$3,'+NOW+') ON CONFLICT(jid,hero_species) DO UPDATE SET stage=EXCLUDED.stage,updated_at=EXCLUDED.updated_at',[jid,heroId,next.stage]);
    await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'purchase',$3)",[jid,next.cost,'Maestria '+next.stage+' — '+playableHero(heroId).name]);
    return {ok:true,stage:next.stage,xp,cost:next.cost,hero:playableHero(heroId).name};
  });
}

export async function handlePlayableHeroCommand({cmd,args=[],sender,reply}={}){
  if(!['heroi','herois','herói','heroes'].includes(String(cmd||'')))return false
  const action=String(args[0]||'').trim().toLowerCase()
  const findHero=raw=>PECADOS_HEROES.find(h=>
    h.name.toLowerCase()===raw||h.species===raw||h.species==='pecado_'+raw);
  if(['evoluir','upar','evolucao'].includes(action)){
    const raw=String(args[1]||'').trim().toLowerCase();
    if(!raw){
      const list=await listPlayableHeroes(sender);
      const lines=list.filter(h=>h.owned).map(h=>{
        const next=heroMasteryNext(h.masteryStage);
        return '• *'+h.name+'* — Nv.'+h.petLevel+'/100 • Maestria '+h.masteryStage+'/5 • '+h.masteryXp+' XP'+
          (next?' | Próximo: '+next.xp+' XP e R$ '+next.cost.toLocaleString('pt-BR'):' | Nível máximo');
      });
      await reply('🌈⚔️ *EVOLUÇÃO DE MAESTRIA*\n\n'+(lines.join('\n')||'Nenhum Pecado conquistado.')+
        '\n\n🔒 Ganhar XP não ativa o estágio automaticamente.\n💰 Use *!heroi evoluir ban* para pagar e liberar o próximo estágio.\n📈 Normal: até 400 XP de maestria/dia e 550 XP de nível/dia por herói em Boss/Raid.\n🌈 De 26/10 a 01/11: a Raid 75 dos Pecados concede 120 XP de maestria por vitória elegível e permite até 600 XP/dia no total (incluindo outras fontes).');
      return true;
    }
    const selected=findHero(raw);
    if(!selected){await reply('❌ Herói não encontrado.');return true;}
    const result=await evolvePlayableHeroMastery(sender,selected.species);
    await reply(result.max?'🏆 '+selected.name+' já está na Maestria máxima.':
      '🌈⚔️ *'+selected.name.toUpperCase()+' — MAESTRIA '+result.stage+' LIBERADA!*\n💰 Custo: R$ '+result.cost.toLocaleString('pt-BR')+
      '\n✨ XP preservado: '+result.xp+'\n✅ Habilidade do estágio disponível.');
    return true;
  }
  if(['atributos','ficha','stats','status'].includes(action)){
    const sheet=await getPlayableHeroCombatSheet(sender);
    await reply(sheet?formatPlayableHeroCombatSheet(sheet):
      '🧙 Sua classe tradicional está ativa. Use *!heroi usar ban* ou outro herói desbloqueado; depois consulte *!heroi atributos*.');
    return true;
  }
  if(['habilidades','poderes','skills'].includes(action)){
    const requested=String(args[1]||'').trim().toLowerCase();
    if(!requested){
      const overview=PECADOS_HEROES.map(h=>
        '• *'+h.name+'* — '+HERO_COMBAT_PROFILES[h.species].role+
        ' • '+HERO_COMBAT_PROFILES[h.species].range+' • '+HERO_COMBAT_PROFILES[h.species].skill).join('\n');
      await reply('🌈⚔️ *HABILIDADES DOS 7 PECADOS*\n\n'+overview+
        '\n\n📖 Use *!heroi habilidades ban* (ou o nome de outro Pecado) para ver os efeitos e desbloqueios.');
      return true;
    }
    const hero=findHero(requested);
    if(!hero){await reply('❌ Pecado desconhecido. Use *!heroi habilidades* para ver os sete.');return true;}
    const guide=HERO_SKILL_GUIDE[hero.species];
    const owned=await listPlayableHeroes(sender);
    const info=owned.find(x=>x.id===hero.species);
    const next=heroMasteryNext(info?.masteryStage||1);
    const nextXp=next?.xp||null;
    await reply('🌈⚔️ *'+hero.name.toUpperCase()+' — HABILIDADES*\n'+
      (info?.owned?'✅ Desbloqueado • Nv.'+info.petLevel+'/100 • Maestria '+info.masteryStage+'/5 ('+info.masteryXp+' XP)':
        '🔒 Você ainda não desbloqueou este personagem.')+'\n\n'+
      '🎭 *Estilo:* '+HERO_COMBAT_PROFILES[hero.species].role+' • '+HERO_COMBAT_PROFILES[hero.species].range+'\n\n'+
      '1️⃣ *Passiva — Maestria I:* '+guide.passive+'\n'+
      '2️⃣ *Especial — Maestria II (500 XP + R$ 2 mi):* '+guide.special+'\n'+
      '3️⃣ *Suprema — Maestria III (1.500 XP + R$ 5 mi):* '+guide.ultimate+'\n'+
      '4️⃣ *Maestria IV (3.500 XP + R$ 12 mi):* +1% de dano.\n'+
      '5️⃣ *Maestria V (7.000 XP + R$ 25 mi):* mais +1% de dano.\n\n'+
      (nextXp?'🎯 Próximo estágio: '+nextXp+' XP e R$ '+next.cost.toLocaleString('pt-BR')+'. Use !heroi evoluir '+hero.name.toLowerCase()+'.\n':'🏆 Maestria máxima!\n')+
      '⚖️ Bônus ofensivo por golpe: até 30% no Boss e 35% na Raid.\n'+
      '💡 Habilidades próprias em Boss, Raid e PvP; classes e Despertares preservados.\n📊 Use *!heroi atributos* para ver os atributos do herói equipado.');
    return true;
  }
  if(!action||action==='lista'||action==='maestria'){
    const list=await listPlayableHeroes(sender)
    const active=list.find(h=>h.active)
    const rows=list.map(h=>`${h.owned?'✅':'🔒'} *${h.name}* — ${h.owned?`Nv.${h.petLevel}/100 • Maestria ${h.masteryStage}/5 (${h.masteryXp} XP)`:'não obtido'}${h.active?' • ⚔️ ATIVO':''}\n   ↳ ${HERO_COMBAT_PROFILES[h.id].role} • ${HERO_COMBAT_PROFILES[h.id].range} • ${HERO_COMBAT_PROFILES[h.id].skill}`)
    await reply('🌈⚔️ *HERÓIS JOGÁVEIS — 7 PECADOS*\n\n'+rows.join('\n')+
      '\n\n🧙 Classe tradicional preservada.\n⚔️ Combatente: *'+(active?.name||'sua classe')+'*\n'+
      '👉 *!heroi atributos* • *!heroi evoluir* • *!heroi habilidades ban* • *!heroi usar ban* • *!heroi classe*\n'+
      '🗝️ Personagens conquistados preservados. Os Pecados não são mais pets; use outros pets em seu time.')
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
    '🌈⚔️ *'+hero.name.toUpperCase()+' SELECIONADO!*\n\nEle agora luta em PvP, Boss e Raid no lugar da sua classe, sem apagar seu Despertar nem os pets comuns.\nVeja o HP, ATK, DEF e VEL com *!heroi atributos*.\nUse *!heroi classe* para voltar.')
  return true
}
