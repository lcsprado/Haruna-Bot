import {db,ensureUser,grantExpInTransaction,petMaxHp,petMaxEnergy} from './db.js'

const TYPES=['battle','dungeon','work','pet_train','boss_damage','legend_raid']
const MAIN=TYPES.slice(0,5)
const DEFINITIONS=[
  {type:'battle',title:'⚔️ Guerreiro',target:5,cash:25000,xp:500,petXp:0},
  {type:'dungeon',title:'🏰 Explorador',target:2,cash:30000,xp:600,petXp:0},
  {type:'work',title:'💼 Trabalhador',target:3,cash:20000,xp:400,petXp:0},
  {type:'pet_train',title:'🐾 Treinador',target:5,cash:20000,xp:0,petXp:500},
  {type:'boss_damage',title:'👹 Caçador',target:10000,cash:40000,xp:800,petXp:0}
]
const MONEY=[1,1.5,2,2.5,3],XP=[1,1.25,1.5,1.75,2]
const levelTier=n=>n>=200?4:n>=150?3:n>=100?2:n>=50?1:0
const dateValue=x=>x instanceof Date?x.toISOString().slice(0,10):(String(x||'').match(/\d{4}-\d{2}-\d{2}/)?.[0]||null)
const dateDiff=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000)
const nowDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const milestone=streak=>{
 const d=((streak-1)%30)+1
 const m={3:{cash:50000},7:{cash:150000,item:'caixa_epica',qty:1},14:{cash:300000,item:'caixa_epica',qty:2},21:{cash:500000,item:'caixa_epica',qty:3},30:{cash:1000000,item:'caixa_lendaria',qty:1}}
 return m[d]||null
}
export const DAILY_V2_TYPES=TYPES

async function tx(fn){
 const c=await db.connect()
 try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}
 catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function initDailyV2(){
 await db.query(`
   ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS reward_xp INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS reward_pet_xp INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS level_snapshot INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS money_factor NUMERIC NOT NULL DEFAULT 1;
   ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS xp_factor NUMERIC NOT NULL DEFAULT 1;
   ALTER TABLE daily_streaks ADD COLUMN IF NOT EXISTS last_protection_used_day DATE;
   CREATE TABLE IF NOT EXISTS daily_activity_events(
     jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
     day_key TEXT NOT NULL,
     source_key TEXT NOT NULL,
     activity_type TEXT NOT NULL,
     amount INTEGER NOT NULL,
     created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
     PRIMARY KEY(jid,day_key,source_key)
   );
   CREATE TABLE IF NOT EXISTS daily_reward_claims(
     jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
     day_key TEXT NOT NULL,
     reward_type TEXT NOT NULL,
     created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
     PRIMARY KEY(jid,day_key,reward_type)
   );
 `)
 console.log('[DAILY V2] schema ready')
 try{await auditAndRepairLp20261010()}catch(err){console.error('[DAILY V2] LP repair audit failed; no speculative repair',err?.message||err)}
 try{await runDailyV2SmokeTest()}catch(err){console.error('[DAILY V2 SMOKE FAIL]',err?.stack||err)}
}

async function ensureRows(c,jid){
 const today=nowDay()
 // Nível e presença das seis missões em um único round-trip ao Neon.
 const ur=await c.query(`
   SELECT u.level,
     (SELECT COUNT(*)::integer FROM daily_missions
       WHERE jid=$1 AND day_key=$2 AND mission_type=ANY($3::text[])) AS mission_count
   FROM users u WHERE u.jid=$1
 `,[jid,today,TYPES])
 if(!ur.rows.length)throw new Error('Jogador não encontrado para missões diárias.')
 const level=Number(ur.rows[0].level||1),tier=levelTier(level)
 if(Number(ur.rows[0].mission_count||0)===6)return {today,level,tier}
 const special=level<10
   ?{type:'legend_raid',title:'🌟 Caçador de Lendas (alternativa: Boss)',target:2500,cash:25000,xp:1500,petXp:500}
   :{type:'legend_raid',title:'🌟 Caçador de Lendas (Raids)',target:50000,cash:25000,xp:1500,petXp:500}
 const insert=[...DEFINITIONS,special]
 for(const m of insert){
   const cash=Math.round(m.cash*(m.type==='legend_raid'?1:MONEY[tier]))
   const xp=Math.round(m.xp*(m.type==='legend_raid'?1:XP[tier]))
   const petXp=Math.round(m.petXp*(m.type==='legend_raid'?1:XP[tier]))
   await c.query(`INSERT INTO daily_missions
     (jid,day_key,mission_type,title,target,reward_cash,reward_xp,reward_pet_xp,reward_box,level_snapshot,money_factor,xp_factor)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11)
     ON CONFLICT(jid,day_key,mission_type) DO NOTHING`,
     [jid,today,m.type,m.title,m.target,cash,xp,petXp,level,MONEY[tier],XP[tier]])
   // Só migra missões legadas NÃO resgatadas. O snapshot após isso nunca muda.
   await c.query(`UPDATE daily_missions SET title=$4,target=$5,reward_cash=$6,reward_xp=$7,
       reward_pet_xp=$8,level_snapshot=$9,money_factor=$10,xp_factor=$11,reward_box=0
     WHERE jid=$1 AND day_key=$2 AND mission_type=$3 AND claimed=FALSE AND level_snapshot=0`,
     [jid,today,m.type,m.title,m.target,cash,xp,petXp,level,MONEY[tier],XP[tier]])
 }
 return {today,level,tier}
}

export async function getDailyMissionsV2(jid){
 await ensureUser(jid)
 return tx(async c=>{
   const ctx=await ensureRows(c,jid)
   const rows=(await c.query(`SELECT mission_type,title,target,reward_cash,reward_xp,reward_pet_xp,
     progress,claimed,level_snapshot FROM daily_missions
     WHERE jid=$1 AND day_key=$2 AND mission_type=ANY($3::text[])
     ORDER BY CASE mission_type WHEN 'battle' THEN 1 WHEN 'dungeon' THEN 2 WHEN 'work' THEN 3 WHEN 'pet_train' THEN 4 WHEN 'boss_damage' THEN 5 ELSE 6 END`,
     [jid,ctx.today,TYPES])).rows
   const streak=(await c.query('SELECT streak FROM daily_streaks WHERE jid=$1',[jid])).rows[0]?.streak||0
   const already=(await c.query("SELECT 1 FROM daily_reward_claims WHERE jid=$1 AND day_key=$2 AND reward_type='all_five'",[jid,ctx.today])).rowCount>0
   const prize=[['caixa_rara',1],['caixa_rara',2],['caixa_epica',1],['caixa_epica',2],['caixa_epica',3]][levelTier(Number(rows.find(x=>x.mission_type==='battle')?.level_snapshot||ctx.level))]
   return {day:ctx.today,missions:rows,streak:Number(streak),bonusItem:prize[0],bonusQty:prize[1],bonusClaimed:already}
 })
}

async function creditBox(c,jid,id,qty){
 const exists=await c.query('SELECT id FROM items WHERE id=$1',[id])
 if(!exists.rows.length)throw new Error('Recompensa bloqueada: ID real inexistente '+id)
 await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3)
   ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity`,[jid,id,qty])
}

async function givePetExp(c,jid,amount){
 if(amount<=0)return {petXp:0}
 const p=(await c.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
 if(!p)return {petXp:0,noPet:true}
 const oldXp=Number(p.xp||0),rawXp=Math.min(9900,oldXp+amount)
 const nextLv=Math.min(100,1+Math.floor(rawXp/100)),added=Math.max(0,nextLv-Number(p.level||1))
 const maxHp=petMaxHp(nextLv,rawXp,p.species)
 const maxEnergy=petMaxEnergy(nextLv,p.species)
 await c.query(`UPDATE pets SET xp=$2,level=$3,power=power+$4,max_hp=$5,hp=LEAST($5,hp+$6),
   energy=LEAST($7,energy+$8) WHERE jid=$1`,[jid,rawXp,nextLv,added*2,maxHp,Math.max(0,maxHp-Number(p.max_hp||maxHp)),maxEnergy,added*3])
 await c.query(`UPDATE pet_collection SET xp=$2,level=$3,power=power+$4,max_hp=$5,hp=LEAST($5,hp+$6),
   energy=LEAST($7,energy+$8) WHERE jid=$1 AND active=TRUE`,[jid,rawXp,nextLv,added*2,maxHp,Math.max(0,maxHp-Number(p.max_hp||maxHp)),maxEnergy,added*3])
 return {petXp:rawXp-oldXp}
}

async function creditCash(c,jid,amount,kind,day){
 if(amount<=0)return
 await c.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[amount,jid])
 await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
  VALUES('system',$1,$2,$3,$4)`,[jid,amount,'daily_v2',kind+':'+day])
}

async function claimDailyInTx(c,jid,day){
 // Nos golpes seguintes do mesmo dia não é necessário INSERT/SELECT FOR UPDATE.
 // A primeira atividade ainda passa pelo bloqueio transacional original.
 const prior=(await c.query('SELECT streak,best_streak,last_claim_day FROM daily_streaks WHERE jid=$1',[jid])).rows[0]
 if(prior&&dateValue(prior.last_claim_day)===day)
   return {ok:false,streak:Number(prior.streak||0),bestStreak:Number(prior.best_streak||0)}
 await c.query(`INSERT INTO daily_streaks(jid,streak,best_streak,last_claim_day)
    VALUES($1,0,0,NULL) ON CONFLICT(jid) DO NOTHING`,[jid])
 const row=(await c.query('SELECT * FROM daily_streaks WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
 const previous=dateValue(row.last_claim_day)
 if(previous===day)return {ok:false,streak:Number(row.streak||0),bestStreak:Number(row.best_streak||0)}
 const already=await c.query(`INSERT INTO daily_reward_claims(jid,day_key,reward_type) VALUES($1,$2,'daily')
   ON CONFLICT DO NOTHING RETURNING jid`,[jid,day])
 if(!already.rowCount)return {ok:false,streak:Number(row.streak||0),bestStreak:Number(row.best_streak||0)}
 const diff=previous?dateDiff(day,previous):999
 const protectedDay=dateValue(row.last_protection_used_day)
 const protectedGap=diff===2&&(!protectedDay||dateDiff(day,protectedDay)>=30)
 const continued=diff===1||protectedGap
 const streak=continued?Number(row.streak||0)+1:1
 const bestStreak=Math.max(Number(row.best_streak||0),streak)
 const level=Number((await c.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]?.level||1)
 const tier=levelTier(level)
 const baseCash=[15000,30000,50000,75000,100000][tier],exp=[300,500,800,1000,1500][tier]
 const extra=milestone(streak),bonusCash=Number(extra?.cash||0)
 if(extra?.item)await creditBox(c,jid,extra.item,extra.qty)
 await creditCash(c,jid,baseCash+bonusCash,'daily',day)
 await grantExpInTransaction(c,jid,exp)
 await c.query(`UPDATE daily_streaks SET streak=$2,best_streak=$3,last_claim_day=$4::date,
   last_protection_used_day=CASE WHEN $5 THEN $4::date ELSE last_protection_used_day END,
   updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1`,
   [jid,streak,bestStreak,day,protectedGap])
 console.log('[DAILY V2 CLAIM]',JSON.stringify({jid,day,level,streak,cash:baseCash+bonusCash,exp,protectedGap}))
 return {ok:true,amount:baseCash,bonusCash,totalCash:baseCash+bonusCash,exp,streak,bestStreak,
   protectedGap,continued,eventMultiplier:1,reward:extra?{label:extra.item?(extra.qty+'x '+(extra.item==='caixa_lendaria'?'Caixa Lendária':'Caixa Épica')):'Bônus de sequência',itemId:extra.item||null,qty:extra.qty||0,bonusCash}:null,
   next:nextMark(streak)}
}

function nextMark(streak){
 const day=((Math.max(1,streak)-1)%30)+1
 const next=[3,7,14,21,30].find(n=>n>day)||30
 const label={3:'R$ 50.000',7:'R$ 150.000 + Caixa Épica',14:'R$ 300.000 + 2 Caixas Épicas',21:'R$ 500.000 + 3 Caixas Épicas',30:'R$ 1.000.000 + Caixa Lendária'}[next]
 return {day:next,days:Math.max(0,next-day),label}
}

export async function claimDailyV2(jid){
 await ensureUser(jid)
 return tx(async c=>claimDailyInTx(c,jid,nowDay()))
}

export async function progressDailyMissionV2(jid,type,amount=1,sourceKey=null,options={}){
 if(!['battle','dungeon','work','pet_train','boss_damage','raid_damage'].includes(type))return null
 amount=Math.floor(Number(amount))
 if(!Number.isSafeInteger(amount)||amount<=0)return null
 // Boss já executa ensureUser no primeiro golpe da sessão (inclusive retomadas).
 // ensureRows mantém a conferência de existência em users antes de registrar XP.
 if(!options.skipEnsureUser) await ensureUser(jid)
 return tx(async c=>{
   const ctx=await ensureRows(c,jid)
   const key=sourceKey?String(sourceKey).slice(0,220):'valid:'+type+':'+Date.now()+':'+Math.random().toString(36).slice(2)
   const recorded=await c.query(`INSERT INTO daily_activity_events(jid,day_key,source_key,activity_type,amount)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING jid`,[jid,ctx.today,key,type,amount])
   if(!recorded.rowCount)return {duplicate:true}
   const changes=[]
   const alt=type==='boss_damage'?(await c.query("SELECT target FROM daily_missions WHERE jid=$1 AND day_key=$2 AND mission_type='legend_raid'",[jid,ctx.today])).rows[0]:null
   const targets=type==='raid_damage'?['boss_damage',...(Number(alt?.target||50000)>=50000?['legend_raid']:[]) ]
     :type==='boss_damage'?['boss_damage',...(Number(alt?.target||50000)===2500?['legend_raid']:[])]:[type]
   for(const target of targets){
     const updated=await c.query(`UPDATE daily_missions SET progress=LEAST(target,progress+$1)
       WHERE jid=$2 AND day_key=$3 AND mission_type=$4
       RETURNING mission_type,progress,target`,[amount,jid,ctx.today,target])
     if(updated.rows[0])changes.push(updated.rows[0])
   }
   const daily=await claimDailyInTx(c,jid,ctx.today)
   return {daily,changes}
 })
}

export async function claimDailyMissionsV2(jid){
 await ensureUser(jid)
 return tx(async c=>{
   const ctx=await ensureRows(c,jid)
   const ready=(await c.query(`SELECT * FROM daily_missions WHERE jid=$1 AND day_key=$2
      AND mission_type=ANY($3::text[]) AND progress>=target AND claimed=FALSE FOR UPDATE`,
      [jid,ctx.today,TYPES])).rows
   let cash=0,exp=0,petXp=0,claimed=0,boxes=0
   const drops=[]
   for(const m of ready){
     const lock=await c.query(`INSERT INTO daily_reward_claims(jid,day_key,reward_type)
       VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING jid`,
       [jid,ctx.today,'mission:'+m.mission_type])
     if(!lock.rowCount)continue
     cash+=Number(m.reward_cash||0);exp+=Number(m.reward_xp||0);petXp+=Number(m.reward_pet_xp||0);claimed++
     if(m.mission_type==='legend_raid'){await creditBox(c,jid,'caixa_epica',1);boxes++;drops.push('Caixa Épica')}
     await c.query(`UPDATE daily_missions SET claimed=TRUE WHERE jid=$1 AND day_key=$2 AND mission_type=$3`,[jid,ctx.today,m.mission_type])
   }
   const all=(await c.query(`SELECT COUNT(*)::integer AS total FROM daily_missions WHERE jid=$1 AND day_key=$2
     AND mission_type=ANY($3::text[]) AND claimed=TRUE`,[jid,ctx.today,MAIN])).rows[0]?.total===5
   if(all){
     const mark=await c.query(`INSERT INTO daily_reward_claims(jid,day_key,reward_type)
       VALUES($1,$2,'all_five') ON CONFLICT DO NOTHING RETURNING jid`,[jid,ctx.today])
     if(mark.rowCount){
       const frozen=(await c.query(`SELECT level_snapshot FROM daily_missions
         WHERE jid=$1 AND day_key=$2 AND mission_type='battle'`,[jid,ctx.today])).rows[0]
       const prize=[['caixa_rara',1],['caixa_rara',2],['caixa_epica',1],['caixa_epica',2],['caixa_epica',3]][levelTier(Number(frozen?.level_snapshot||ctx.level))]
       await creditBox(c,jid,prize[0],prize[1]);boxes+=prize[1];drops.push(prize[1]+'x '+(prize[0]==='caixa_rara'?'Caixa Rara':'Caixa Épica'))
     }
   }
   if(cash)await creditCash(c,jid,cash,'missions',ctx.today)
   if(exp)await grantExpInTransaction(c,jid,exp)
   const pet=await givePetExp(c,jid,petXp)
   if(claimed||drops.length)console.log('[MISSIONS V2 CLAIM]',JSON.stringify({jid,day:ctx.today,claimed,cash,exp,petXp:pet.petXp,boxes,drops}))
   return {claimed,cash,exp,petXp:pet.petXp,boxes,drops,bonusAwarded:drops.some(x=>x.includes('x '))}
 })
}

// Correção individual: só com JID e evidência transacional da atividade e streak anteriores.
export async function auditAndRepairLp20261010(){
 const jid='5511948523167@s.whatsapp.net'
 const marker='repair:lp-streak:2026-10-10:activity-v1'
 return tx(async c=>{
   if((await c.query('SELECT 1 FROM trevo_settings WHERE key=$1',[marker])).rowCount)return {status:'already'}
   const user=(await c.query('SELECT jid,push_name FROM users WHERE jid=$1',[jid])).rows[0]
   if(!user||!/LP/i.test(String(user.push_name||''))){
     console.warn('[LP STREAK AUDIT] identity not corroborated',JSON.stringify({jid,name:user?.push_name||null}))
     return {status:'identity_unconfirmed'}
   }
   const valid=(await c.query(`SELECT type,note,created_at FROM transactions
     WHERE (from_jid=$1 OR to_jid=$1)
       AND TO_CHAR(TO_TIMESTAMP(created_at) AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD')='2026-10-10'
       AND (type IN ('work','dungeon_reward','battle_reward','uber','ifood','boss_common','boss_weekend','boss_event_eclipse','raid_reward','raid')
            OR type LIKE 'boss_event_%' OR type LIKE 'raid_%')
     ORDER BY created_at DESC LIMIT 8`,[jid])).rows
   const historical=(await c.query(`SELECT type,note,created_at FROM transactions
     WHERE to_jid=$1 AND note LIKE 'daily streak:%'
       AND TO_CHAR(TO_TIMESTAMP(created_at) AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD')='2026-10-09'
     ORDER BY created_at DESC LIMIT 2`,[jid])).rows
   const state=(await c.query(`SELECT streak,best_streak,TO_CHAR(last_claim_day,'YYYY-MM-DD') AS day
     FROM daily_streaks WHERE jid=$1 FOR UPDATE`,[jid])).rows[0]
   const prior=Number(String(historical[0]?.note||'').match(/daily streak:(\d+)/)?.[1]||0)
   console.log('[LP STREAK AUDIT]',JSON.stringify({jid,name:user.push_name,before:state||null,priorOnOct9:prior,validOct10:valid}))
   if(!valid.length||!prior||!state||!['2026-10-09','2026-10-11'].includes(state.day)){
      console.warn('[LP STREAK AUDIT] no correction, insufficient evidence or unexpected state')
      return {status:'evidence_insufficient',validCount:valid.length,prior,day:state?.day}
   }
   const target=state.day==='2026-10-11'?prior+2:prior+1
   if(Number(state.streak||0)>=target)return {status:'already_continuous',before:state}
   const day=state.day==='2026-10-09'?'2026-10-10':'2026-10-11'
   await c.query(`UPDATE daily_streaks SET streak=$2,best_streak=GREATEST(best_streak,$2),
      last_claim_day=$3::date,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1`,[jid,target,day])
   const result={jid,name:user.push_name,before:state,after:{streak:target,day},validOct10:valid.map(x=>({type:x.type,note:x.note,at:x.created_at})),prior}
   await c.query(`INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
      ON CONFLICT(key) DO NOTHING`,[marker,JSON.stringify(result)])
   console.log('[LP STREAK REPAIR APPLIED]',JSON.stringify(result))
   return {status:'repaired',...result}
 })
}

export function validateDailyV2Formulas(){
  const money=[1,1.5,2,2.5,3],xp=[1,1.25,1.5,1.75,2]
  const levels=[1,49,50,99,100,149,150,199,200,500]
  const expected=[0,0,1,1,2,2,3,3,4,4]
  if(levels.some((v,i)=>levelTier(v)!==expected[i]))throw new Error('Level tier boundaries incorrect')
  const total=DEFINITIONS.reduce((n,m)=>n+m.cash,0)
  if(total!==135000)throw new Error('Base money mission pool does not total 135000')
  for(let t=0;t<5;t++){
    if(MONEY[t]!==money[t]||XP[t]!==xp[t])throw new Error('Multiplier mismatch for tier '+t)
  }
  if(milestone(3)?.cash!==50000||milestone(7)?.item!=='caixa_epica'||milestone(14)?.qty!==2
    ||milestone(21)?.cash!==500000||milestone(30)?.item!=='caixa_lendaria'
    ||milestone(31)!==null||milestone(33)?.cash!==50000)
    throw new Error('Sequence milestones or cycle invalid')
  return {status:'pass',tiers:5,levelBoundaries:levels.length,baseCash:total,mainMissions:5,specialMissions:1,
    milestoneDays:[3,7,14,21,30],day31Continues:true}
}

export async function runDailyV2SmokeTest(){
  const checks=validateDailyV2Formulas()
  const jid='5511948523167@s.whatsapp.net'
  const catalog=await db.query("SELECT id FROM items WHERE id=ANY($1::text[])",[['caixa_rara','caixa_epica','caixa_lendaria']])
  const found=new Set(catalog.rows.map(x=>x.id))
  if(found.size!==3)throw new Error('Mission catalog is missing one or more real box IDs')
  const result=await getDailyMissionsV2(jid)
  if(result.missions.length!==6||TYPES.some(t=>!result.missions.some(m=>m.mission_type===t)))
    throw new Error('Expected 5+1 generated mission rows')
  if(result.missions.some(m=>Number(m.target)<1||Number(m.reward_cash)<0))
    throw new Error('Invalid mission rewards or targets')
  const streak=(await db.query("SELECT streak,best_streak,TO_CHAR(last_claim_day,'YYYY-MM-DD') AS day FROM daily_streaks WHERE jid=$1",[jid])).rows[0]
  const rewardDup=(await db.query("SELECT jid,day_key,reward_type FROM daily_reward_claims GROUP BY jid,day_key,reward_type HAVING COUNT(*)>1 LIMIT 1")).rows
  if(rewardDup.length)throw new Error('Duplicate reward idempotency markers detected')
  const summary={...checks,missionCount:result.missions.length,missionDay:result.day,
    currentLevelSnapshot:Number(result.missions.find(m=>m.mission_type==='battle')?.level_snapshot||0),
    ids:[...found],lpStreak:streak,
    sample:result.missions.map(m=>({type:m.mission_type,target:Number(m.target),cash:Number(m.reward_cash),
      xp:Number(m.reward_xp),petXp:Number(m.reward_pet_xp),claimed:m.claimed}))}
  console.log('[DAILY V2 SMOKE PASS]',JSON.stringify(summary))
  return summary
}
