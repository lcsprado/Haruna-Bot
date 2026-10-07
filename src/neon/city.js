import { db, grantExpInTransaction } from './db.js'
import { changeAlphaReputation, getAlphaReputation } from './progression.js'

const TALK_PERIOD_SECONDS=6*60*60
const DARK_PERIOD_SECONDS=4*60*60
const ROB_COOLDOWN_SECONDS=2*60*60
const RUMOR_TTL_SECONDS=24*60*60
const RUMOR_DAILY_LIMIT=3
const CITY_EVENT_COOLDOWN_SECONDS=2*60*60

export const CITY_LOCATIONS=Object.freeze([
  {id:'ferreiro',emoji:'⚒️',name:'Forja do Mark',npcId:'mark',npcName:'Mark',title:'Ferreiro',shopType:'gear',robbable:true,
    greeting:'Eae, meu patrão. Qual a boa de hoje?'},
  {id:'alquimista',emoji:'🧪',name:'Alquimia da Lyra',npcId:'lyra',npcName:'Lyra',title:'Alquimista',shopType:'consumables',robbable:true,
    greeting:'Poções não resolvem tudo. Mas resolvem bastante coisa.'},
  {id:'concessionaria',emoji:'🚗',name:'Concessionária do Dante',npcId:'dante',npcName:'Dante',title:'Concessionário',shopType:'cars',robbable:true,
    greeting:'Se tem dinheiro e coragem, eu tenho a chave.'},
  {id:'delivery',emoji:'🏍️',name:'Garagem do Riko',npcId:'riko',npcName:'Riko',title:'Mecânico',shopType:'motorcycles',robbable:true,
    greeting:'Moto boa é a que volta inteira no fim do corre.'},
  {id:'taverna',emoji:'🍺',name:'Taverna da Íris',npcId:'iris',npcName:'Íris',title:'Taberneira',shopType:'contracts',robbable:true,
    greeting:'Senta aí. Sempre tem trabalho pra quem não foge de problema.'},
  {id:'mercadores',emoji:'🏘️',name:'Distrito dos Mercadores',npcId:'baltazar',npcName:'Baltazar',title:'Mercador',shopType:'npcs',robbable:true,
    greeting:'Preço justo existe. Só depende de quem está perguntando.'},
  {id:'sombrio',emoji:'🌑',name:'Mercado Sombrio',npcId:'nyx',npcName:'Nyx',title:'Corretora das Sombras',shopType:'dark',robbable:false,
    greeting:'Aqui ninguém pergunta seu nome. Só o que você está disposto a fazer.'}
])

const DARK_MISSIONS=Object.freeze([
  {id:'ataque_cidade',task:'attack_city',title:'🔥 Ataque à Cidade',description:'Participe de um ataque clandestino contra a cidade.',target:1,cash:18000,karma:-5},
  {id:'roubo_npc',task:'rob_npc',title:'🥷 Mãos no Caixa',description:'Roube um comerciante da cidade com sucesso.',target:1,cash:22000,karma:0},
  {id:'sabotagem',task:'sabotage_city',title:'💣 Sabotagem',description:'Sabote a infraestrutura da cidade sem ser identificado.',target:1,cash:15000,karma:-4},
  {id:'ataque_cidade_2',task:'attack_city',title:'🗡️ Recado das Sombras',description:'Ataque um posto da guarda e deixe o aviso do Mercado Sombrio.',target:1,cash:20000,karma:-5},
  {id:'roubo_npc_2',task:'rob_npc',title:'💰 Cobrança Indevida',description:'Arranque dinheiro de um comerciante da cidade.',target:1,cash:24000,karma:0}
])

const period=(seconds)=>Math.floor(Math.floor(Date.now()/1000)/seconds)
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0))

function resolveLocation(ref){
  const key=String(ref||'').trim().toLowerCase()
  return CITY_LOCATIONS.find((x,i)=>x.id===key||String(i+1)===key)||null
}
function npcLocation(ref){
  const key=String(ref||'').trim().toLowerCase()
  return CITY_LOCATIONS.find((x,i)=>x.npcId===key||x.id===key||String(i+1)===key)||null
}
async function tx(fn){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    const out=await fn(c)
    await c.query('COMMIT')
    return out
  }catch(err){
    await c.query('ROLLBACK')
    throw err
  }finally{ c.release() }
}

export async function initCity(){
  await db.query(`
    CREATE TABLE IF NOT EXISTS alpha_npc_reputation(
      jid TEXT NOT NULL,
      npc_id TEXT NOT NULL,
      reputation INTEGER NOT NULL DEFAULT 0 CHECK(reputation BETWEEN -100 AND 100),
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      PRIMARY KEY(jid,npc_id)
    );
    CREATE TABLE IF NOT EXISTS alpha_city_talks(
      jid TEXT NOT NULL,
      npc_id TEXT NOT NULL,
      period BIGINT NOT NULL,
      question_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      truthful BOOLEAN NOT NULL,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      PRIMARY KEY(jid,npc_id,period)
    );
    CREATE TABLE IF NOT EXISTS alpha_city_flags(
      jid TEXT NOT NULL,
      flag TEXT NOT NULL,
      value BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      PRIMARY KEY(jid,flag)
    );
    CREATE TABLE IF NOT EXISTS alpha_npc_robbery(
      jid TEXT PRIMARY KEY,
      last_attempt_at BIGINT NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      successes INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS alpha_dark_contracts(
      jid TEXT NOT NULL,
      cycle BIGINT NOT NULL,
      mission_id TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      target INTEGER NOT NULL DEFAULT 1,
      claimed BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at BIGINT NOT NULL,
      accepted_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      PRIMARY KEY(jid,cycle)
    );

    CREATE TABLE IF NOT EXISTS alpha_city_incidents(
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      actor_jid TEXT,
      target_jid TEXT,
      npc_id TEXT,
      amount BIGINT NOT NULL DEFAULT 0,
      outcome TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );
    CREATE INDEX IF NOT EXISTS alpha_city_incidents_actor_idx ON alpha_city_incidents(actor_jid,created_at DESC);
    CREATE INDEX IF NOT EXISTS alpha_city_incidents_target_idx ON alpha_city_incidents(target_jid,created_at DESC);
    CREATE INDEX IF NOT EXISTS alpha_city_incidents_npc_idx ON alpha_city_incidents(npc_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS alpha_city_reputation(
      jid TEXT PRIMARY KEY,
      trust INTEGER NOT NULL DEFAULT 0 CHECK(trust BETWEEN -100 AND 100),
      notoriety INTEGER NOT NULL DEFAULT 0 CHECK(notoriety BETWEEN 0 AND 100),
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS alpha_city_rumors(
      id BIGSERIAL PRIMARY KEY,
      author_jid TEXT NOT NULL,
      accused_jid TEXT NOT NULL,
      claim TEXT NOT NULL,
      truth BOOLEAN NOT NULL DEFAULT FALSE,
      credibility INTEGER NOT NULL DEFAULT 50 CHECK(credibility BETWEEN 0 AND 100),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      discovered_false BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      expires_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS alpha_city_rumors_active_idx ON alpha_city_rumors(active,expires_at,created_at DESC);
    CREATE INDEX IF NOT EXISTS alpha_city_rumors_accused_idx ON alpha_city_rumors(accused_jid,created_at DESC);

    CREATE TABLE IF NOT EXISTS alpha_city_responses(
      incident_id BIGINT NOT NULL REFERENCES alpha_city_incidents(id) ON DELETE CASCADE,
      jid TEXT NOT NULL,
      npc_id TEXT NOT NULL,
      choice TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      PRIMARY KEY(incident_id,jid,npc_id)
    );

    CREATE TABLE IF NOT EXISTS alpha_city_encounters(
      id BIGSERIAL PRIMARY KEY,
      jid TEXT NOT NULL,
      event_key TEXT NOT NULL,
      npc_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      expires_at BIGINT NOT NULL,
      resolved_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS alpha_city_encounters_jid_idx ON alpha_city_encounters(jid,status,created_at DESC);
  `)
}

export async function getNpcCityReputation(jid,npcRef){
  const loc=npcLocation(npcRef)
  if(!loc) throw new Error('NPC não encontrado na cidade.')
  const row=(await db.query('SELECT reputation FROM alpha_npc_reputation WHERE jid=$1 AND npc_id=$2',[jid,loc.npcId])).rows[0]
  return {npcId:loc.npcId,npcName:loc.npcName,reputation:Number(row?.reputation||0)}
}

async function changeNpcRep(jid,npcId,delta,client=db){
  const r=await client.query(`
    INSERT INTO alpha_npc_reputation(jid,npc_id,reputation)
    VALUES($1,$2,$3)
    ON CONFLICT(jid,npc_id) DO UPDATE SET
      reputation=GREATEST(-100,LEAST(100,alpha_npc_reputation.reputation+$3)),
      updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
    RETURNING reputation
  `,[jid,npcId,clamp(delta,-100,100)])
  return Number(r.rows[0]?.reputation||0)
}

async function darkUnlocked(jid,karma=null){
  const score=karma==null?(await getAlphaReputation(jid)).karma:Number(karma)
  if(score<0) return true
  const flag=await db.query("SELECT 1 FROM alpha_city_flags WHERE jid=$1 AND flag='dark_market_unlocked' AND value=TRUE",[jid])
  return flag.rowCount>0
}
async function unlockDark(jid,client=db){
  await client.query(`
    INSERT INTO alpha_city_flags(jid,flag,value) VALUES($1,'dark_market_unlocked',TRUE)
    ON CONFLICT(jid,flag) DO UPDATE SET value=TRUE,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
  `,[jid])
}

export async function listCityLocations(jid){
  const rep=await getAlphaReputation(jid)
  const unlocked=await darkUnlocked(jid,rep.karma)
  return {
    karma:rep.karma,title:rep.title,darkUnlocked:unlocked,
    locations:CITY_LOCATIONS.map((x,i)=>({...x,number:i+1,locked:x.id==='sombrio'&&!unlocked}))
  }
}

export async function getCityLocation(jid,ref){
  const loc=resolveLocation(ref)
  if(!loc) throw new Error('Local inválido. Use !cidade.')
  const karma=(await getAlphaReputation(jid)).karma
  if(loc.id==='sombrio'&&!(await darkUnlocked(jid,karma)))
    throw new Error('🌑 Esse lugar ainda não existe para você. Baixe seu Karma ou conquiste a confiança das sombras.')
  const rep=await getNpcCityReputation(jid,loc.npcId)
  return {...loc,karma,npcReputation:rep.reputation}
}

const QUESTIONS=Object.freeze([
  {id:'raid',action:'raid_victory',window:7*86400,text:'Ouvi dizer que derrubaram uma criatura numa Raid esses dias. Você ajudou?'},
  {id:'boss',action:'boss_victory',window:7*86400,text:'Falaram que você estava na linha de frente contra um Boss. É verdade?'},
  {id:'roubo',action:'robbery_success',window:7*86400,text:'Tem boato de que você participou de um roubo recentemente. Foi você?'}
])

function questionFor(loc,p){
  const allowed=loc.id==='sombrio'?QUESTIONS.filter(q=>q.id==='roubo')
    :loc.id==='ferreiro'||loc.id==='alquimista'?QUESTIONS.filter(q=>q.id!=='roubo')
    :QUESTIONS
  const seed=[...loc.npcId].reduce((a,c)=>a+c.charCodeAt(0),0)+p
  return allowed[Math.abs(seed)%allowed.length]
}

export async function startNpcConversation(jid,npcRef){
  const loc=await getCityLocation(jid,npcRef)
  const p=period(TALK_PERIOD_SECONDS)
  const used=await db.query('SELECT 1 FROM alpha_city_talks WHERE jid=$1 AND npc_id=$2 AND period=$3',[jid,loc.npcId,p])
  if(used.rowCount) throw new Error('💬 Esse NPC já conversou bastante com você agora. Volte em algumas horas.')
  const q=questionFor(loc,p)
  return {npcId:loc.npcId,npcName:loc.npcName,locationId:loc.id,questionId:q.id,text:q.text}
}

export async function resolveNpcConversation(jid,npcRef,questionId,answer){
  const loc=await getCityLocation(jid,npcRef)
  const q=QUESTIONS.find(x=>x.id===questionId)
  if(!q) throw new Error('Conversa expirada. Fale com o NPC novamente.')
  const yes=['1','sim','s','yes'].includes(String(answer||'').trim().toLowerCase())
  const p=period(TALK_PERIOD_SECONDS)
  const evidence=(await db.query(
    'SELECT 1 FROM alpha_reputation_events WHERE jid=$1 AND action=$2 AND created_at>=EXTRACT(EPOCH FROM NOW())::BIGINT-$3 LIMIT 1',
    [jid,q.action,q.window]
  )).rowCount>0
  const truthful=yes===evidence
  const isDark=loc.id==='sombrio'||loc.npcId==='mordek'
  const repDelta=truthful?(yes?3:1):-5
  const karmaDelta=truthful?(isDark&&yes&&q.id==='roubo'?-1:(q.id==='roubo'?0:1)):-1
  const npcRep=await tx(async c=>{
    await c.query(`
      INSERT INTO alpha_city_talks(jid,npc_id,period,question_id,answer,truthful)
      VALUES($1,$2,$3,$4,$5,$6)
    `,[jid,loc.npcId,p,q.id,yes?'sim':'nao',truthful])
    return changeNpcRep(jid,loc.npcId,repDelta,c)
  })
  if(karmaDelta) await changeAlphaReputation(jid,karmaDelta>0?'hero_contract':'villain_contract',karmaDelta).catch(()=>{})
  if(isDark&&truthful&&yes&&q.id==='roubo') await unlockDark(jid)
  const karma=(await getAlphaReputation(jid)).karma
  return {
    truthful,evidence,claimed:yes,npcRep,karma,
    message:truthful
      ?(yes?loc.npcName+' confirma a história e passa a confiar mais em você.':loc.npcName+' percebeu que você falou a verdade.')
      :loc.npcName+' percebeu a mentira. Sua reputação com esse NPC caiu.'
  }
}

async function activeDarkContract(jid,client=db){
  const cyc=period(DARK_PERIOD_SECONDS)
  const row=(await client.query('SELECT * FROM alpha_dark_contracts WHERE jid=$1 AND cycle=$2',[jid,cyc])).rows[0]
  if(!row) return null
  const mission=DARK_MISSIONS.find(x=>x.id===row.mission_id)
  return mission?{...row,mission}:null
}
async function progressDark(jid,task,client=db){
  const active=await activeDarkContract(jid,client)
  if(!active||active.claimed||active.mission.task!==task) return null
  const next=Math.min(Number(active.target),Number(active.progress)+1)
  await client.query('UPDATE alpha_dark_contracts SET progress=$1 WHERE jid=$2 AND cycle=$3',[next,jid,active.cycle])
  return {...active,progress:next}
}

export async function robCityNpc(jid,npcRef){
  const loc=await getCityLocation(jid,npcRef)
  if(!loc.robbable) throw new Error('Esse NPC não pode ser roubado.')
  const now=Math.floor(Date.now()/1000)
  const result=await tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['npc-rob:'+jid])
    const cd=(await c.query('SELECT * FROM alpha_npc_robbery WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const remaining=ROB_COOLDOWN_SECONDS-(now-Number(cd?.last_attempt_at||0))
    if(remaining>0) throw new Error('🥷 Você ainda está muito visado. Tente roubar NPC novamente em '+Math.ceil(remaining/60)+' min.')
    const user=(await c.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]
    const level=Math.max(1,Number(user?.level||1))
    const npcRep=(await c.query('SELECT reputation FROM alpha_npc_reputation WHERE jid=$1 AND npc_id=$2',[jid,loc.npcId])).rows[0]
    const rep=Number(npcRep?.reputation||0)
    const chance=clamp(.32-rep*.0015,.18,.42)
    const success=Math.random()<chance
    const reward=Math.min(15000,Math.round(2500+level*120))
    const fine=Math.min(10000,Math.round(1800+level*80))
    await c.query(`
      INSERT INTO alpha_npc_robbery(jid,last_attempt_at,attempts,successes)
      VALUES($1,$2,1,$3)
      ON CONFLICT(jid) DO UPDATE SET
        last_attempt_at=$2,attempts=alpha_npc_robbery.attempts+1,
        successes=alpha_npc_robbery.successes+$3
    `,[jid,now,success?1:0])
    let actual=0
    if(success){
      await c.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[reward,jid])
      actual=reward
      await changeNpcRep(jid,loc.npcId,-12,c)
      await c.query(`
        INSERT INTO alpha_city_incidents(kind,actor_jid,npc_id,amount,outcome,metadata)
        VALUES('npc_robbery',$1,$2,$3,'success',$4::jsonb)
      `,[jid,loc.npcId,reward,JSON.stringify({npcName:loc.npcName})])
      await unlockDark(jid,c)
      await progressDark(jid,'rob_npc',c)
    }else{
      const row=(await c.query('UPDATE wallets SET cash=GREATEST(0,cash-$1) WHERE jid=$2 RETURNING cash',[fine,jid])).rows[0]
      actual=fine
      await changeNpcRep(jid,loc.npcId,-6,c)
      await c.query(`
        INSERT INTO alpha_city_incidents(kind,actor_jid,npc_id,amount,outcome,metadata)
        VALUES('npc_robbery',$1,$2,$3,'caught',$4::jsonb)
      `,[jid,loc.npcId,fine,JSON.stringify({npcName:loc.npcName})])
    }
    return {success,amount:actual,npcName:loc.npcName,chance}
  })
  await changeAlphaReputation(jid,result.success?'robbery_success':'robbery_failure',result.success?-5:-2).catch(()=>{})
  await changeCityStanding(jid,{trust:result.success?-5:-3,notoriety:result.success?8:5})
  return {...result,karma:(await getAlphaReputation(jid)).karma}
}


async function getCityStandingRow(jid){
  const now=Math.floor(Date.now()/1000)
  await db.query(`
    INSERT INTO alpha_city_reputation(jid) VALUES($1)
    ON CONFLICT(jid) DO NOTHING
  `,[jid])
  const row=(await db.query(
    'SELECT trust,notoriety,updated_at FROM alpha_city_reputation WHERE jid=$1',
    [jid]
  )).rows[0]||{}
  const elapsed=Math.max(0,now-Number(row.updated_at||now))
  const steps=Math.floor(elapsed/(6*60*60))
  let trust=Number(row.trust||0)
  let notoriety=Number(row.notoriety||0)
  if(steps>0){
    trust=trust>0?Math.max(0,trust-steps):Math.min(0,trust+steps)
    notoriety=Math.max(0,notoriety-steps)
    await db.query(
      'UPDATE alpha_city_reputation SET trust=$1,notoriety=$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$3',
      [trust,notoriety,jid]
    )
  }
  return {trust,notoriety}
}

async function changeCityStanding(jid,{trust=0,notoriety=0}={}){
  await getCityStandingRow(jid)
  const row=(await db.query(`
    UPDATE alpha_city_reputation
    SET trust=GREATEST(-100,LEAST(100,trust+$1)),
        notoriety=GREATEST(0,LEAST(100,notoriety+$2)),
        updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE jid=$3
    RETURNING trust,notoriety
  `,[Math.trunc(Number(trust)||0),Math.trunc(Number(notoriety)||0),jid])).rows[0]
  return {trust:Number(row?.trust||0),notoriety:Number(row?.notoriety||0)}
}

export async function getCityStanding(jid){
  const social=await getCityStandingRow(jid)
  const rep=await getAlphaReputation(jid)
  return {...social,karma:rep.karma,title:rep.title}
}

export async function getCityMerchantModifier(jid,npcId){
  const s=await getCityStanding(jid)
  const key=String(npcId||'').toLowerCase()
  if(key==='mordek'||key==='nyx'){
    return {...s,factor:clamp(1-(s.notoriety*.001)+(Math.max(0,s.trust)*.0005),.90,1.08),blocked:false}
  }
  return {
    ...s,
    factor:clamp(1+(s.notoriety*.0015)-(Math.max(0,s.trust)*.0007),.94,1.15),
    blocked:s.notoriety>=85 && ['helena','baltazar'].includes(key)
  }
}

export async function recordPlayerRobberyIncident(thiefJid,targetJid,result){
  if(!result?.ok) return null
  const amount=Number(result.success?result.amount:result.fine)||0
  const outcome=result.success?'success':'caught'
  const row=(await db.query(`
    INSERT INTO alpha_city_incidents(kind,actor_jid,target_jid,amount,outcome,metadata)
    VALUES('player_robbery',$1,$2,$3,$4,$5::jsonb)
    RETURNING *
  `,[thiefJid,targetJid,amount,outcome,JSON.stringify({chance:Number(result.chance||0)})])).rows[0]
  await changeCityStanding(thiefJid,{trust:result.success?-2:-1,notoriety:result.success?6:4})
  return row
}

async function recentSuccessfulRobberyBy(jid){
  return (await db.query(`
    SELECT * FROM alpha_city_incidents
    WHERE kind='player_robbery' AND actor_jid=$1 AND outcome='success'
      AND created_at>EXTRACT(EPOCH FROM NOW())::BIGINT-$2
    ORDER BY created_at DESC LIMIT 1
  `,[jid,2*86400])).rows[0]||null
}

export async function spreadCityRumor(authorJid,accusedJid,claim='roubo'){
  if(authorJid===accusedJid) throw new Error('Você não pode espalhar um rumor sobre si mesmo.')
  const count=Number((await db.query(`
    SELECT COUNT(*)::int AS n FROM alpha_city_rumors
    WHERE author_jid=$1 AND created_at>EXTRACT(EPOCH FROM NOW())::BIGINT-86400
  `,[authorJid])).rows[0]?.n||0)
  if(count>=RUMOR_DAILY_LIMIT) throw new Error('Você já espalhou 3 rumores nas últimas 24h.')
  const evidence=await recentSuccessfulRobberyBy(accusedJid)
  const standing=await getCityStanding(authorJid)
  const truth=Boolean(evidence)
  const credibility=clamp(45+Math.floor(standing.trust/4)-(standing.notoriety>50?10:0),15,85)
  const now=Math.floor(Date.now()/1000)
  const row=(await db.query(`
    INSERT INTO alpha_city_rumors(author_jid,accused_jid,claim,truth,credibility,expires_at)
    VALUES($1,$2,$3,$4,$5,$6)
    RETURNING *
  `,[authorJid,accusedJid,String(claim||'roubo').slice(0,140),truth,credibility,now+RUMOR_TTL_SECONDS])).rows[0]
  await changeCityStanding(accusedJid,{trust:truth?-2:-1,notoriety:truth?10:5})
  return row
}

async function maybeExposeFalseRumor(rumor){
  if(!rumor||rumor.truth||rumor.discovered_false||!rumor.active) return null
  const chance=.30+(Number(rumor.credibility||50)<35?.15:0)
  if(Math.random()>=chance) return null
  const exposed=(await db.query(`
    UPDATE alpha_city_rumors SET discovered_false=TRUE,active=FALSE
    WHERE id=$1 AND active=TRUE RETURNING *
  `,[rumor.id])).rows[0]
  if(!exposed) return null
  await changeCityStanding(exposed.accused_jid,{trust:1,notoriety:-5})
  await changeCityStanding(exposed.author_jid,{trust:-10,notoriety:8})
  await changeAlphaReputation(exposed.author_jid,'villain_contract',-3).catch(()=>null)
  return exposed
}

export async function listCityRumors(limit=6){
  await db.query('UPDATE alpha_city_rumors SET active=FALSE WHERE active=TRUE AND expires_at<=EXTRACT(EPOCH FROM NOW())::BIGINT')
  return (await db.query(`
    SELECT r.*,a.push_name AS author_name,u.push_name AS accused_name
    FROM alpha_city_rumors r
    LEFT JOIN users a ON a.jid=r.author_jid
    LEFT JOIN users u ON u.jid=r.accused_jid
    WHERE r.active=TRUE ORDER BY r.created_at DESC LIMIT $1
  `,[Math.max(1,Math.min(10,Number(limit)||6))])).rows
}

export async function getNpcMemory(jid,npcRef){
  const loc=await getCityLocation(jid,npcRef)
  const own=(await db.query(`
    SELECT * FROM alpha_city_incidents
    WHERE actor_jid=$1 AND npc_id=$2
      AND created_at>EXTRACT(EPOCH FROM NOW())::BIGINT-$3
    ORDER BY created_at DESC LIMIT 1
  `,[jid,loc.npcId,3*86400])).rows[0]
  if(own?.kind==='npc_robbery'){
    return {location:loc,kind:'personal',text:'“Eu lembro de você. Depois do que tentou fazer comigo, confiança não volta tão rápido.”'}
  }

  const incident=(await db.query(`
    SELECT i.*,a.push_name AS actor_name,t.push_name AS target_name
    FROM alpha_city_incidents i
    LEFT JOIN users a ON a.jid=i.actor_jid
    LEFT JOIN users t ON t.jid=i.target_jid
    WHERE i.created_at>EXTRACT(EPOCH FROM NOW())::BIGINT-$1
    ORDER BY i.created_at DESC LIMIT 1
  `,[2*86400])).rows[0]
  if(incident?.kind==='player_robbery'){
    const text=incident.outcome==='success'
      ?'“Meu dia começou mal para alguém daqui... '+(incident.target_name||'uma pessoa')+' perdeu R$ '+Number(incident.amount||0).toLocaleString('pt-BR')+'. Dizem que '+(incident.actor_name||'alguém')+' estava por perto. Você viu algo?”'
      :'“Ouvi que '+(incident.actor_name||'alguém')+' tentou roubar '+(incident.target_name||'uma pessoa')+' e foi pego. Você sabe alguma coisa?”'
    return {location:loc,kind:'incident',incident,text}
  }

  const rumors=await listCityRumors(5)
  if(rumors.length){
    const rumor=rumors[Math.floor(Math.random()*rumors.length)]
    const exposed=await maybeExposeFalseRumor(rumor)
    if(exposed){
      const liar=(await db.query('SELECT push_name FROM users WHERE jid=$1',[exposed.author_jid])).rows[0]?.push_name||'alguém'
      const accused=(await db.query('SELECT push_name FROM users WHERE jid=$1',[exposed.accused_jid])).rows[0]?.push_name||'a pessoa acusada'
      return {location:loc,kind:'rumor_exposed',text:'“Descobrimos que aquele rumor sobre '+accused+' era mentira. '+liar+' inventou a história. Isso não vai ser esquecido.”'}
    }
    return {location:loc,kind:'rumor',rumor,text:'“Tem um rumor correndo pela cidade: dizem que '+(rumor.accused_name||'alguém')+' anda envolvido em '+rumor.claim+'. Não sei se acredito ainda.”'}
  }

  const s=await getCityStanding(jid)
  if(s.notoriety>=60) return {location:loc,kind:'standing',text:'“Seu nome está circulando demais. Gente demais anda desconfiada de você.”'}
  if(s.trust>=30) return {location:loc,kind:'standing',text:'“Seu nome tem sido citado de um jeito bom. Continue assim.”'}
  return {location:loc,kind:'ambient',text:'“A cidade parece calma hoje. Mas calma demais nunca dura por aqui.”'}
}

export async function respondNpcMemory(jid,npcRef,incidentId,choice){
  const loc=await getCityLocation(jid,npcRef)
  const map={1:'saw',2:'did_not_see',3:'help'}
  const selected=map[Number(choice)]
  if(!selected) throw new Error('Escolha 1, 2 ou 3.')
  const incident=(await db.query('SELECT * FROM alpha_city_incidents WHERE id=$1',[Number(incidentId)])).rows[0]
  if(!incident) throw new Error('Esse assunto já esfriou.')
  const prior=(await db.query('SELECT choice FROM alpha_city_responses WHERE incident_id=$1 AND jid=$2 AND npc_id=$3',[incident.id,jid,loc.npcId])).rows[0]
  if(prior) return {already:true,text:'“Você já me respondeu sobre isso. Eu lembro.”'}
  await db.query('INSERT INTO alpha_city_responses(incident_id,jid,npc_id,choice) VALUES($1,$2,$3,$4)',[incident.id,jid,loc.npcId,selected])

  if(selected==='saw'){
    if(incident.actor_jid===jid){
      await changeCityStanding(jid,{trust:-1,notoriety:1})
      return {text:'“Você diz que viu... mas sua história está estranha. Vou ficar de olho.”'}
    }
    await changeCityStanding(jid,{trust:1})
    return {text:'“Entendi. Se lembrar de mais alguma coisa, me procure.”'}
  }
  if(selected==='did_not_see') return {text:'“Certo. Melhor admitir que não sabe do que inventar uma história.”'}
  await changeCityStanding(jid,{trust:3,notoriety:-1})
  await changeAlphaReputation(jid,'hero_contract',1).catch(()=>null)
  return {karma:1,text:'“Se quer ajudar de verdade, isso conta. A cidade lembra de quem aparece quando alguém precisa.”'}
}

const CITY_ENCOUNTERS=Object.freeze([
  {key:'monster',title:'👹 UM MONSTRO INVADIU A CIDADE',text:'Gritos vêm da praça. Você está perto o bastante para agir.'},
  {key:'help',title:'🧓 ALGUÉM PRECISA DE AJUDA',text:'Você encontra um morador machucado tentando carregar suas coisas.'},
  {key:'rob_npc',title:'🌒 OPORTUNIDADE NA RUA ESCURA',text:'Um comerciante está andando sozinho pela noite.'}
])

export async function maybeCreateCityEncounter(jid,{force=false}={}){
  const now=Math.floor(Date.now()/1000)
  const last=(await db.query('SELECT created_at FROM alpha_city_encounters WHERE jid=$1 ORDER BY created_at DESC LIMIT 1',[jid])).rows[0]
  if(!force&&last&&now-Number(last.created_at)<CITY_EVENT_COOLDOWN_SECONDS) return null
  if(!force&&Math.random()>=.07) return null
  const tpl=CITY_ENCOUNTERS[Math.floor(Math.random()*CITY_ENCOUNTERS.length)]
  const candidates=CITY_LOCATIONS.filter(x=>x.robbable)
  const loc=tpl.key==='rob_npc'?candidates[Math.floor(Math.random()*candidates.length)]:null
  const payload={
    title:tpl.title,
    text:loc?loc.npcName+' está andando sozinho pela noite. Ninguém parece estar olhando.':tpl.text,
    options:tpl.key==='rob_npc'?['1️⃣ Assaltar','2️⃣ Ignorar']:tpl.key==='monster'?['1️⃣ Defender','2️⃣ Ignorar']:['1️⃣ Ajudar','2️⃣ Ignorar']
  }
  return (await db.query(`
    INSERT INTO alpha_city_encounters(jid,event_key,npc_id,payload,expires_at)
    VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *
  `,[jid,tpl.key,loc?.npcId||null,JSON.stringify(payload),now+10*60])).rows[0]
}

export async function getPendingCityEncounter(jid){
  return (await db.query(`
    SELECT * FROM alpha_city_encounters
    WHERE jid=$1 AND status='pending' AND expires_at>EXTRACT(EPOCH FROM NOW())::BIGINT
    ORDER BY created_at DESC LIMIT 1
  `,[jid])).rows[0]||null
}

export async function resolveCityEncounter(jid,id,choice){
  choice=Number(choice)
  if(![1,2].includes(choice)) throw new Error('Escolha 1 ou 2.')
  const event=(await db.query(`
    SELECT * FROM alpha_city_encounters
    WHERE id=$1 AND jid=$2 AND status='pending'
      AND expires_at>EXTRACT(EPOCH FROM NOW())::BIGINT
    FOR UPDATE
  `,[Number(id),jid])).rows[0]
  if(!event) throw new Error('Esse evento já terminou.')
  const level=Number((await db.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]?.level||1)
  let out={cash:0,xp:0,karma:0,text:''}

  if(event.event_key==='monster'){
    if(choice===1){
      const won=Math.random()<.72
      if(won){
        out={cash:500+level*35,xp:100+level*8,karma:2,text:'⚔️ Você ajudou a expulsar o monstro. Os moradores viram quem ficou para lutar.'}
        await db.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[out.cash,jid])
        await changeAlphaReputation(jid,'hero_contract',2).catch(()=>null)
        await changeCityStanding(jid,{trust:5,notoriety:-2})
      }else{
        const cash=Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0]?.cash||0)
        const loss=Math.min(1500+level*20,cash)
        out={cash:-loss,xp:0,karma:1,text:'🩸 Você tentou defender a cidade, mas saiu ferido. Mesmo assim, sua atitude foi lembrada.'}
        if(loss>0) await db.query('UPDATE wallets SET cash=GREATEST(0,cash-$1) WHERE jid=$2',[loss,jid])
        await changeAlphaReputation(jid,'hero_contract',1).catch(()=>null)
        await changeCityStanding(jid,{trust:3,notoriety:-1})
      }
    }else{
      const seen=Math.random()<.55
      out={cash:0,xp:0,karma:seen?-1:0,text:seen?'👀 Você foi visto indo embora enquanto podia ajudar. A história começou a circular.':'🚶 Você foi embora. Desta vez ninguém ligou seu nome ao ocorrido.'}
      if(seen){
        await changeAlphaReputation(jid,'villain_contract',-1).catch(()=>null)
        await changeCityStanding(jid,{trust:-3,notoriety:2})
      }
    }
  }else if(event.event_key==='help'){
    if(choice===1){
      out={cash:0,xp:60+level*4,karma:2,text:'🤝 Você ajudou sem pedir nada em troca. O gesto virou assunto entre os moradores.'}
      await changeAlphaReputation(jid,'hero_contract',2).catch(()=>null)
      await changeCityStanding(jid,{trust:5,notoriety:-1})
    }else{
      const seen=Math.random()<.35
      out={cash:0,xp:0,karma:seen?-1:0,text:seen?'😶 Alguém percebeu que você poderia ter ajudado e preferiu ignorar.':'🚶 Você seguiu caminho sem se envolver.'}
      if(seen){
        await changeAlphaReputation(jid,'villain_contract',-1).catch(()=>null)
        await changeCityStanding(jid,{trust:-2,notoriety:1})
      }
    }
  }else if(event.event_key==='rob_npc'){
    const loc=npcLocation(event.npc_id)
    if(choice===1){
      const robbery=await robCityNpc(jid,loc?.npcId||event.npc_id)
      out={
        cash:robbery.success?Number(robbery.amount||0):-Number(robbery.amount||0),
        xp:0,
        karma:robbery.success?-5:-2,
        text:robbery.success?'🥷 Você assaltou '+robbery.npcName+'. Ele vai lembrar disso.':'🚨 '+robbery.npcName+' percebeu a tentativa. Você foi pego — e ele vai lembrar.'
      }
    }else{
      out={cash:0,xp:0,karma:0,text:'🌙 Você deixou a oportunidade passar e seguiu seu caminho.'}
      if(Math.random()<.25){
        out.karma=1
        out.text+=' Alguém percebeu que você poderia ter se aproveitado e não fez isso.'
        await changeAlphaReputation(jid,'hero_contract',1).catch(()=>null)
        await changeCityStanding(jid,{trust:2,notoriety:-1})
      }
    }
  }

  if(out.xp>0) await tx(async client=>grantExpInTransaction(client,jid,out.xp))
  await db.query("UPDATE alpha_city_encounters SET status='resolved',resolved_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id=$1 AND jid=$2",[event.id,jid])
  return out
}

function darkRewardForLevel(level,mission){
  const base=level>=80?{cash:10000,xp:1400}:level>=50?{cash:6500,xp:900}:level>=20?{cash:3000,xp:500}:{cash:1500,xp:250}
  const cash=Math.max(base.cash,Math.min(Number(mission?.cash||base.cash),base.cash*2))
  return {cash,xp:base.xp}
}

function darkBoardForCycle(cyc){
  const start=Math.abs(cyc)%DARK_MISSIONS.length
  return [0,1,2].map(i=>DARK_MISSIONS[(start+i)%DARK_MISSIONS.length])
}
export async function getDarkContractBoard(jid){
  const rep=await getAlphaReputation(jid)
  if(!(await darkUnlocked(jid,rep.karma))) throw new Error('🌑 Você ainda não encontrou o Mercado Sombrio.')
  const cyc=period(DARK_PERIOD_SECONDS)
  const expires=(cyc+1)*DARK_PERIOD_SECONDS
  const level=Number((await db.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]?.level||1)
  const missions=darkBoardForCycle(cyc).map(m=>({...m,reward:darkRewardForLevel(level,m)}))
  const active=await activeDarkContract(jid)
  return {karma:rep.karma,level,missions,active:active?{...active,reward:darkRewardForLevel(level,active.mission)}:null,expiresAt:expires}
}

export async function acceptDarkContract(jid,index){
  const board=await getDarkContractBoard(jid)
  const n=Number(index)
  const mission=board.missions[n-1]
  if(!mission) throw new Error('Missão sombria inválida. Escolha 1, 2 ou 3.')
  const cyc=period(DARK_PERIOD_SECONDS)
  try{
    await db.query(`
      INSERT INTO alpha_dark_contracts(jid,cycle,mission_id,target,expires_at)
      VALUES($1,$2,$3,$4,$5)
    `,[jid,cyc,mission.id,mission.target,(cyc+1)*DARK_PERIOD_SECONDS])
  }catch(err){
    if(err?.code==='23505') throw new Error('Você já aceitou uma missão sombria neste ciclo.')
    throw err
  }
  const level=Number((await db.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]?.level||1)
  return {mission:{...mission,reward:darkRewardForLevel(level,mission)}}
}

export async function performDarkCityAction(jid,task){
  if(!['attack_city','sabotage_city'].includes(task)) throw new Error('Ação sombria inválida.')
  const active=await activeDarkContract(jid)
  if(!active||active.mission.task!==task) throw new Error('🌑 Você precisa aceitar a missão correspondente no Mercado Sombrio primeiro.')
  if(Number(active.progress)>=Number(active.target)) throw new Error('Essa missão já está concluída. Use !resgatarsombras.')
  const successChance=task==='attack_city' ? 0.72 : 0.78
  const success=Math.random()<successChance
  const level=Number((await db.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]?.level||1)
  let fine=0
  if(success){
    await progressDark(jid,task)
    await changeAlphaReputation(jid,'villain_contract',active.mission.karma).catch(()=>{})
  }else{
    fine=Math.min(12000,2000+level*90)
    await db.query('UPDATE wallets SET cash=GREATEST(0,cash-$1) WHERE jid=$2',[fine,jid])
    await changeAlphaReputation(jid,'villain_contract',-2).catch(()=>{})
  }
  return {success,fine,mission:active.mission,karma:(await getAlphaReputation(jid)).karma}
}

export async function claimDarkContract(jid){
  return tx(async c=>{
    const active=await activeDarkContract(jid,c)
    if(!active) throw new Error('Você não possui missão sombria ativa neste ciclo.')
    if(active.claimed) throw new Error('Essa missão já foi resgatada.')
    if(Number(active.progress)<Number(active.target)) throw new Error('Missão ainda em andamento: '+active.progress+'/'+active.target+'.')
    const level=Number((await c.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]?.level||1)
    const reward=darkRewardForLevel(level,active.mission)
    await c.query('UPDATE alpha_dark_contracts SET claimed=TRUE WHERE jid=$1 AND cycle=$2',[jid,active.cycle])
    await c.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[reward.cash,jid])
    const xpResult=await grantExpInTransaction(c,jid,reward.xp)
    return {mission:active.mission,cash:reward.cash,xp:reward.xp,xpResult}
  })
}
