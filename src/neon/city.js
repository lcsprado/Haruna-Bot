import { db } from './db.js'
import { changeAlphaReputation, getAlphaReputation } from './progression.js'

const TALK_PERIOD_SECONDS=6*60*60
const DARK_PERIOD_SECONDS=4*60*60
const ROB_COOLDOWN_SECONDS=2*60*60

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
  {id:'ataque_cidade',task:'attack_city',title:'🔥 Ataque à Cidade',description:'Participe de um ataque clandestino contra a cidade.',target:1,cash:18000,karma:-6},
  {id:'roubo_npc',task:'rob_npc',title:'🥷 Mãos no Caixa',description:'Roube um comerciante da cidade com sucesso.',target:1,cash:22000,karma:0},
  {id:'sabotagem',task:'sabotage_city',title:'💣 Sabotagem',description:'Sabote a infraestrutura da cidade sem ser identificado.',target:1,cash:15000,karma:-4},
  {id:'ataque_cidade_2',task:'attack_city',title:'🗡️ Recado das Sombras',description:'Ataque um posto da guarda e deixe o aviso do Mercado Sombrio.',target:1,cash:20000,karma:-6},
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
  if(score<=-10) return true
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
  if(karmaDelta) await changeAlphaReputation(jid,'npc_conversation_'+q.id+(truthful?'_truth':'_lie'),karmaDelta).catch(()=>{})
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
      await unlockDark(jid,c)
      await progressDark(jid,'rob_npc',c)
    }else{
      const row=(await c.query('UPDATE wallets SET cash=GREATEST(0,cash-$1) WHERE jid=$2 RETURNING cash',[fine,jid])).rows[0]
      actual=fine
      await changeNpcRep(jid,loc.npcId,-6,c)
    }
    return {success,amount:actual,npcName:loc.npcName,chance}
  })
  await changeAlphaReputation(jid,result.success?'npc_robbery_success':'npc_robbery_failure',result.success?-5:-2).catch(()=>{})
  return {...result,karma:(await getAlphaReputation(jid)).karma}
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
  return {karma:rep.karma,missions:darkBoardForCycle(cyc),active:await activeDarkContract(jid),expiresAt:expires}
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
  return {mission}
}

export async function performDarkCityAction(jid,task){
  if(!['attack_city','sabotage_city'].includes(task)) throw new Error('Ação sombria inválida.')
  const active=await activeDarkContract(jid)
  if(!active||active.mission.task!==task) throw new Error('🌑 Você precisa aceitar a missão correspondente no Mercado Sombrio primeiro.')
  if(Number(active.progress)>=Number(active.target)) throw new Error('Essa missão já está concluída. Use !resgatarsombras.')
  const successChance=task==='attack_city'?.72:.78
  const success=Math.random()<successChance
  const level=Number((await db.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]?.level||1)
  let fine=0
  if(success){
    await progressDark(jid,task)
    await changeAlphaReputation(jid,task,active.mission.karma).catch(()=>{})
  }else{
    fine=Math.min(12000,2000+level*90)
    await db.query('UPDATE wallets SET cash=GREATEST(0,cash-$1) WHERE jid=$2',[fine,jid])
    await changeAlphaReputation(jid,task+'_failed',-2).catch(()=>{})
  }
  return {success,fine,mission:active.mission,karma:(await getAlphaReputation(jid)).karma}
}

export async function claimDarkContract(jid){
  return tx(async c=>{
    const active=await activeDarkContract(jid,c)
    if(!active) throw new Error('Você não possui missão sombria ativa neste ciclo.')
    if(active.claimed) throw new Error('Essa missão já foi resgatada.')
    if(Number(active.progress)<Number(active.target)) throw new Error('Missão ainda em andamento: '+active.progress+'/'+active.target+'.')
    await c.query('UPDATE alpha_dark_contracts SET claimed=TRUE WHERE jid=$1 AND cycle=$2',[jid,active.cycle])
    await c.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[active.mission.cash,jid])
    return {mission:active.mission,cash:active.mission.cash}
  })
}
