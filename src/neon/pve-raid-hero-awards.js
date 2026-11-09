import {playableHero,heroLevelAwardPolicy,heroMasteryAwardPolicy,raid75MasteryBonusActive} from './playable-heroes-core.js'

// Regras transacionais espelhadas de playable-heroes.js/WhatsApp (09/11/2026).
// Nao consulta nem grava nada fora da transacao ja aberta da Raid.
const NOW='EXTRACT(EPOCH FROM NOW())::BIGINT'
export async function awardPlayableHeroLevel(client,{jid,heroId,awardKey,xp=55}={}){
  if(!client||!jid||!playableHero(heroId)||!awardKey)return false
  // A trava serializa Boss e Raid concorrentes para o mesmo jogador.
  const player=(await client.query('SELECT jid,level FROM users WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
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
  const policy=heroLevelAwardPolicy({earnedToday:today[0]?.gained,currentXp:effectiveXp,xp,
    playerLevel:Number(player?.level||0),heroLevel:Number(pet.level||1)})
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

export async function awardPlayableHeroMastery(client,{jid,heroId,awardKey,xp=90,specialRaid75=false,progressReport=null}={}){
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
  if(progressReport){
    progressReport.earned=0
    progressReport.today=Number(today[0]?.gained||0)
    progressReport.limit=policy.dailyCap
    progressReport.reason='limite_diario'
  }
  if(!amount)return false
  const saved=await client.query(`INSERT INTO hero_mastery_awards(jid,award_key,hero_species,xp)
    VALUES($1,$2,$3,$4) ON CONFLICT(jid,award_key) DO NOTHING RETURNING jid`,
    [jid,String(awardKey),heroId,amount])
  if(!saved.rowCount){
    if(progressReport)progressReport.reason='duplicado'
    return false
  }
  const updated=await client.query(`INSERT INTO player_hero_mastery(jid,hero_species,xp,updated_at)
    VALUES($1,$2,$3,${NOW}) ON CONFLICT(jid,hero_species) DO UPDATE
    SET xp=LEAST(7000,player_hero_mastery.xp+EXCLUDED.xp),updated_at=EXCLUDED.updated_at
    RETURNING xp`,[jid,heroId,amount])
  if(progressReport){
    progressReport.earned=amount
    progressReport.today+=amount
    progressReport.limit=policy.dailyCap
    progressReport.total=Number(updated.rows[0]?.xp||0)
    progressReport.reason='creditado'
  }
  return true
}



export async function awardWebRaidHeroProgress(client,{participant,share,level,collab,startedAt,nowMs=Date.now()}={}){
 const p=participant||{},heroId=p.heroId
 const report=heroId?{heroId,earned:0,reason:'participacao_insuficiente'}:null
 if(!heroId||!(Number(share)>=.02)||Number(p.damage||0)<2500)return report
 const special=raid75MasteryBonusActive({level,collab,nowMs})
 const awardKey=(special?'raid:75:':'raid:')+String(startedAt)+':'+String(p.jid)
 await awardPlayableHeroLevel(client,{jid:p.jid,heroId,awardKey,xp:special?180:125})
 const xp=special?(nowMs>=Date.parse('2026-11-02T00:00:00-03:00')?240:120):90
 await awardPlayableHeroMastery(client,{jid:p.jid,heroId,awardKey,xp,specialRaid75:special,progressReport:report})
 return report
}
