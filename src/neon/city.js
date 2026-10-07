import { db, ensureUser, grantExp } from './db.js'
import { getAlphaReputation, changeAlphaReputation } from './progression.js'

const NOW_SQL='EXTRACT(EPOCH FROM NOW())::BIGINT'
const HOUR=3600
const DAY=86400
const CITY_NPCS=Object.freeze([
  {id:'helena',name:'Helena',emoji:'🛡️',merchant:true},
  {id:'mordek',name:'Mordek',emoji:'🗡️',merchant:true},
  {id:'baltazar',name:'Baltazar',emoji:'🎒',merchant:true},
  {id:'lyra',name:'Lyra',emoji:'🌙',merchant:false},
  {id:'mark',name:'Mark',emoji:'⚒️',merchant:false}
])
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0))
const cityNpc=input=>{
  const key=String(input||'').trim().toLowerCase()
  return CITY_NPCS.find((n,i)=>n.id===key||n.name.toLowerCase()===key||String(i+1)===key)||null
}
const periodNow=()=>Math.floor(Math.floor(Date.now()/1000)/(4*HOUR))

export async function initCitySystem(){
  await db.query(`
    CREATE TABLE IF NOT EXISTS alpha_city_incidents(
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      actor_jid TEXT,
      target_jid TEXT,
      npc_id TEXT,
      amount BIGINT NOT NULL DEFAULT 0,
      outcome TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at BIGINT NOT NULL DEFAULT ${NOW_SQL}
    );
    CREATE INDEX IF NOT EXISTS alpha_city_incidents_actor_idx
      ON alpha_city_incidents(actor_jid,created_at DESC);
    CREATE INDEX IF NOT EXISTS alpha_city_incidents_target_idx
      ON alpha_city_incidents(target_jid,created_at DESC);
    CREATE INDEX IF NOT EXISTS alpha_city_incidents_npc_idx
      ON alpha_city_incidents(npc_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS alpha_city_reputation(
      jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      trust INTEGER NOT NULL DEFAULT 0 CHECK(trust BETWEEN -100 AND 100),
      notoriety INTEGER NOT NULL DEFAULT 0 CHECK(notoriety BETWEEN 0 AND 100),
      updated_at BIGINT NOT NULL DEFAULT ${NOW_SQL}
    );

    CREATE TABLE IF NOT EXISTS alpha_rumors(
      id BIGSERIAL PRIMARY KEY,
      author_jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      accused_jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      claim TEXT NOT NULL,
      truth BOOLEAN NOT NULL DEFAULT FALSE,
      credibility INTEGER NOT NULL DEFAULT 50 CHECK(credibility BETWEEN 0 AND 100),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      discovered_false BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL DEFAULT ${NOW_SQL},
      expires_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS alpha_rumors_active_idx
      ON alpha_rumors(active,expires_at,created_at DESC);
    CREATE INDEX IF NOT EXISTS alpha_rumors_accused_idx
      ON alpha_rumors(accused_jid,created_at DESC);

    CREATE TABLE IF NOT EXISTS alpha_city_encounters(
      id BIGSERIAL PRIMARY KEY,
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      npc_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL DEFAULT ${NOW_SQL},
      expires_at BIGINT NOT NULL,
      resolved_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS alpha_city_encounters_jid_idx
      ON alpha_city_encounters(jid,status,created_at DESC);

    CREATE TABLE IF NOT EXISTS alpha_city_responses(
      incident_id BIGINT NOT NULL REFERENCES alpha_city_incidents(id) ON DELETE CASCADE,
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      npc_id TEXT NOT NULL,
      choice TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT ${NOW_SQL},
      PRIMARY KEY(incident_id,jid,npc_id)
    );

    CREATE TABLE IF NOT EXISTS alpha_black_market_missions(
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      period BIGINT NOT NULL,
      target_jid TEXT REFERENCES users(jid) ON DELETE SET NULL,
      target_name TEXT NOT NULL,
      task TEXT NOT NULL DEFAULT 'robbery',
      progress INTEGER NOT NULL DEFAULT 0,
      target INTEGER NOT NULL DEFAULT 1,
      reward_cash BIGINT NOT NULL,
      reward_xp INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL DEFAULT ${NOW_SQL},
      expires_at BIGINT NOT NULL,
      PRIMARY KEY(jid,period)
    );
    CREATE INDEX IF NOT EXISTS alpha_black_market_active_idx
      ON alpha_black_market_missions(jid,status,expires_at);
  `)
}

async function decayCityReputation(jid){
  await ensureUser(jid)
  await db.query(`
    INSERT INTO alpha_city_reputation(jid) VALUES($1)
    ON CONFLICT(jid) DO NOTHING
  `,[jid])
  const {rows}=await db.query(
    'SELECT trust,notoriety,updated_at FROM alpha_city_reputation WHERE jid=$1',
    [jid]
  )
  const row=rows[0]||{}
  const now=Math.floor(Date.now()/1000)
  const elapsed=Math.max(0,now-Number(row.updated_at||now))
  const steps=Math.floor(elapsed/(6*HOUR))
  if(steps>0){
    const trust=Number(row.trust||0)
    const nextTrust=trust>0?Math.max(0,trust-steps):Math.min(0,trust+steps)
    const nextNotoriety=Math.max(0,Number(row.notoriety||0)-steps)
    await db.query(
      `UPDATE alpha_city_reputation SET trust=$1,notoriety=$2,updated_at=${NOW_SQL} WHERE jid=$3`,
      [nextTrust,nextNotoriety,jid]
    )
    return {trust:nextTrust,notoriety:nextNotoriety}
  }
  return {trust:Number(row.trust||0),notoriety:Number(row.notoriety||0)}
}

async function changeCityReputation(jid,{trust=0,notoriety=0}={}){
  await ensureUser(jid)
  await decayCityReputation(jid)
  const {rows}=await db.query(`
    INSERT INTO alpha_city_reputation(jid,trust,notoriety)
    VALUES($1,$2,$3)
    ON CONFLICT(jid) DO UPDATE SET
      trust=GREATEST(-100,LEAST(100,alpha_city_reputation.trust+$2)),
      notoriety=GREATEST(0,LEAST(100,alpha_city_reputation.notoriety+$3)),
      updated_at=${NOW_SQL}
    RETURNING trust,notoriety
  `,[jid,Math.trunc(trust),Math.trunc(notoriety)])
  return {trust:Number(rows[0]?.trust||0),notoriety:Number(rows[0]?.notoriety||0)}
}

export async function getCityStanding(jid){
  const social=await decayCityReputation(jid)
  const karma=await getAlphaReputation(jid)
  return {...social,karma:karma.karma,title:karma.title}
}

export async function getCityPriceModifier(jid,npcId){
  const npc=cityNpc(npcId)
  const standing=await getCityStanding(jid)
  const notoriety=standing.notoriety
  const trust=standing.trust
  if(npc?.id==='mordek'){
    const factor=clamp(1-(notoriety*.001)+(Math.max(0,trust)*.0005),.90,1.08)
    return {factor,blocked:false,...standing}
  }
  const factor=clamp(1+(notoriety*.0015)-(Math.max(0,trust)*.0007),.94,1.15)
  const blocked=notoriety>=85 && ['helena','baltazar'].includes(npc?.id)
  return {factor,blocked,...standing}
}

export async function recordCityRobbery(thiefJid,targetJid,result){
  if(!result?.ok) return null
  await Promise.all([ensureUser(thiefJid),ensureUser(targetJid)])
  const amount=Number(result.success?result.amount:result.fine)||0
  const outcome=result.success?'success':'caught'
  const {rows}=await db.query(`
    INSERT INTO alpha_city_incidents(kind,actor_jid,target_jid,amount,outcome,metadata)
    VALUES('player_robbery',$1,$2,$3,$4,$5::jsonb)
    RETURNING id,created_at
  `,[thiefJid,targetJid,amount,outcome,JSON.stringify({chance:Number(result.chance||0)})])
  await changeCityReputation(thiefJid,{trust:result.success?-2:-1,notoriety:result.success?6:4})
  return rows[0]
}

async function recentRobberyBy(accusedJid){
  const {rows}=await db.query(`
    SELECT i.*,victim.push_name AS victim_name
    FROM alpha_city_incidents i
    LEFT JOIN users victim ON victim.jid=i.target_jid
    WHERE i.kind='player_robbery' AND i.actor_jid=$1
      AND i.outcome='success' AND i.created_at>${NOW_SQL}-$2
    ORDER BY i.created_at DESC
    LIMIT 1
  `,[accusedJid,2*DAY])
  return rows[0]||null
}

export async function spreadRumor(authorJid,accusedJid,claim='roubo'){
  if(authorJid===accusedJid) throw new Error('Você não pode espalhar um rumor sobre si mesmo.')
  await Promise.all([ensureUser(authorJid),ensureUser(accusedJid)])
  const {rows:countRows}=await db.query(`
    SELECT COUNT(*)::int AS n FROM alpha_rumors
    WHERE author_jid=$1 AND created_at>${NOW_SQL}-$2
  `,[authorJid,DAY])
  if(Number(countRows[0]?.n||0)>=3) throw new Error('Você já espalhou 3 rumores nas últimas 24h. A cidade precisa de tempo para reagir.')
  const recent=await recentRobberyBy(accusedJid)
  const truth=Boolean(recent)
  const authorStanding=await getCityStanding(authorJid)
  const credibility=clamp(45+Math.floor(authorStanding.trust/4)-(authorStanding.notoriety>50?10:0),15,85)
  const now=Math.floor(Date.now()/1000)
  const {rows}=await db.query(`
    INSERT INTO alpha_rumors(author_jid,accused_jid,claim,truth,credibility,expires_at)
    VALUES($1,$2,$3,$4,$5,$6)
    RETURNING id,truth,credibility,expires_at
  `,[authorJid,accusedJid,String(claim||'roubo').slice(0,140),truth,credibility,now+DAY])
  await changeCityReputation(accusedJid,{trust:truth?-2:-1,notoriety:truth?10:5})
  return rows[0]
}

async function maybeExposeFalseRumor(rumor){
  if(!rumor || rumor.truth || rumor.discovered_false || !rumor.active) return null
  const chance=0.30+(Number(rumor.credibility||50)<35?0.15:0)
  if(Math.random()>=chance) return null
  const {rows}=await db.query(`
    UPDATE alpha_rumors
    SET discovered_false=TRUE,active=FALSE
    WHERE id=$1 AND active=TRUE
    RETURNING *
  `,[rumor.id])
  const exposed=rows[0]
  if(!exposed) return null
  await changeCityReputation(exposed.accused_jid,{trust:1,notoriety:-5})
  await changeCityReputation(exposed.author_jid,{trust:-10,notoriety:8})
  await changeAlphaReputation(exposed.author_jid,'rumor_lie',-3).catch(()=>null)
  return exposed
}

export async function getRumorFeed(limit=5){
  await db.query(`UPDATE alpha_rumors SET active=FALSE WHERE active=TRUE AND expires_at<=${NOW_SQL}`)
  const {rows}=await db.query(`
    SELECT r.*,a.push_name AS author_name,u.push_name AS accused_name
    FROM alpha_rumors r
    LEFT JOIN users a ON a.jid=r.author_jid
    LEFT JOIN users u ON u.jid=r.accused_jid
    WHERE r.active=TRUE
    ORDER BY r.created_at DESC
    LIMIT $1
  `,[Math.max(1,Math.min(10,Number(limit)||5))])
  return rows
}

export async function getNpcMemory(visitorJid,npcRef){
  const npc=cityNpc(npcRef)
  if(!npc) throw new Error('NPC desconhecido.')
  await ensureUser(visitorJid)
  await db.query(`UPDATE alpha_rumors SET active=FALSE WHERE active=TRUE AND expires_at<=${NOW_SQL}`)

  const {rows:own}=await db.query(`
    SELECT * FROM alpha_city_incidents
    WHERE actor_jid=$1 AND (npc_id=$2 OR kind='player_robbery')
      AND created_at>${NOW_SQL}-$3
    ORDER BY created_at DESC LIMIT 1
  `,[visitorJid,npc.id,3*DAY])
  if(own[0]?.kind==='npc_robbery' && own[0]?.npc_id===npc.id){
    return {npc,text:`“Eu lembro de você. Depois do que tentou fazer comigo, confiança não volta tão rápido.”`,memory:'personal'}
  }

  const {rows:incidentRows}=await db.query(`
    SELECT i.*,actor.push_name AS actor_name,target.push_name AS target_name
    FROM alpha_city_incidents i
    LEFT JOIN users actor ON actor.jid=i.actor_jid
    LEFT JOIN users target ON target.jid=i.target_jid
    WHERE i.created_at>${NOW_SQL}-$1
    ORDER BY i.created_at DESC LIMIT 6
  `,[2*DAY])
  const incident=incidentRows[Math.floor(Math.random()*Math.max(1,incidentRows.length))]
  if(incident?.kind==='player_robbery'){
    if(incident.outcome==='success'){
      return {npc,text:`“Meu dia começou mal para alguém daqui... ${incident.target_name||'uma pessoa'} perdeu R$ ${Number(incident.amount||0).toLocaleString('pt-BR')}. Dizem que ${incident.actor_name||'alguém'} estava por perto. Você viu alguma coisa?”`,memory:'incident',incident}
    }
    return {npc,text:`“Ouvi que ${incident.actor_name||'alguém'} tentou roubar ${incident.target_name||'uma pessoa'} e foi pego. A cidade comenta tudo.”`,memory:'incident',incident}
  }

  const rumors=await getRumorFeed(5)
  if(rumors.length){
    const rumor=rumors[Math.floor(Math.random()*rumors.length)]
    const exposed=await maybeExposeFalseRumor(rumor)
    if(exposed){
      const liar=(await db.query('SELECT push_name FROM users WHERE jid=$1',[exposed.author_jid])).rows[0]?.push_name||'alguém'
      const accused=(await db.query('SELECT push_name FROM users WHERE jid=$1',[exposed.accused_jid])).rows[0]?.push_name||'a pessoa acusada'
      return {npc,text:`“Descobrimos que aquele rumor sobre ${accused} era mentira. Parece que ${liar} inventou a história. Isso não vai ser esquecido.”`,memory:'rumor_exposed'}
    }
    return {npc,text:`“Tem um rumor correndo pela cidade: dizem que ${rumor.accused_name||'alguém'} anda envolvido em roubo. Não sei se acredito ainda.”`,memory:'rumor',rumor}
  }

  const standing=await getCityStanding(visitorJid)
  if(standing.notoriety>=60) return {npc,text:'“Seu nome está circulando demais. Gente demais anda desconfiada de você.”',memory:'standing'}
  if(standing.trust>=30) return {npc,text:'“Seu nome tem sido citado de um jeito bom. Continue assim.”',memory:'standing'}
  return {npc,text:'“A cidade parece calma hoje. Mas calma demais nunca dura muito por aqui.”',memory:'ambient'}
}

export async function respondToNpcIncident(jid,npcRef,incidentId,choice){
  await ensureUser(jid)
  const npc=cityNpc(npcRef)
  if(!npc) throw new Error('NPC desconhecido.')
  const choiceMap={1:'saw',2:'did_not_see',3:'help'}
  const action=choiceMap[Number(choice)]
  if(!action) throw new Error('Escolha 1, 2 ou 3.')

  const {rows:incidentRows}=await db.query(
    'SELECT * FROM alpha_city_incidents WHERE id=$1',
    [Number(incidentId)]
  )
  const incident=incidentRows[0]
  if(!incident) throw new Error('Esse assunto já esfriou na cidade.')

  const existing=(await db.query(
    'SELECT choice FROM alpha_city_responses WHERE incident_id=$1 AND jid=$2 AND npc_id=$3',
    [incident.id,jid,npc.id]
  )).rows[0]
  if(existing){
    return {already:true,choice:existing.choice,text:'“Você já me respondeu sobre isso. Eu lembro.”'}
  }

  await db.query(
    'INSERT INTO alpha_city_responses(incident_id,jid,npc_id,choice) VALUES($1,$2,$3,$4)',
    [incident.id,jid,npc.id,action]
  )

  if(action==='saw'){
    if(incident.actor_jid===jid){
      await changeCityReputation(jid,{trust:-1,notoriety:1})
      return {choice:action,text:'“Você diz que viu... mas está estranho demais contando essa história. Vou ficar de olho.”'}
    }
    await changeCityReputation(jid,{trust:1})
    return {choice:action,text:'“Entendi. Se lembrar de mais alguma coisa, me procure. Informação também constrói reputação.”'}
  }

  if(action==='did_not_see'){
    return {choice:action,text:'“Certo. Melhor dizer que não sabe do que inventar uma história.”'}
  }

  await changeCityReputation(jid,{trust:3,notoriety:-1})
  await changeAlphaReputation(jid,'city_help',1).catch(()=>null)
  return {
    choice:action,
    karma:1,
    text:'“Se quer ajudar de verdade, isso conta. A cidade lembra de quem aparece quando alguém precisa.”'
  }
}

const encounterTemplates=[
  {key:'monster_attack',title:'👹 UM MONSTRO INVADIU A CIDADE',text:'Gritos vêm da praça. Você está perto o bastante para agir.',options:['1️⃣ Defender a cidade','2️⃣ Ignorar e seguir seu caminho']},
  {key:'npc_help',title:'🧓 ALGUÉM PRECISA DE AJUDA',text:'Você encontra um morador machucado tentando carregar suas coisas.',options:['1️⃣ Ajudar','2️⃣ Ignorar']},
  {key:'npc_robbery',title:'🌒 OPORTUNIDADE NA RUA ESCURA',text:'Um NPC está andando sozinho pela noite. Ninguém parece estar olhando.',options:['1️⃣ Assaltar','2️⃣ Ignorar']}
]

export async function maybeCreateCityEncounter(jid,{force=false}={}){
  await ensureUser(jid)
  const now=Math.floor(Date.now()/1000)
  const {rows:lastRows}=await db.query(`
    SELECT created_at FROM alpha_city_encounters
    WHERE jid=$1 ORDER BY created_at DESC LIMIT 1
  `,[jid])
  if(!force && lastRows[0] && now-Number(lastRows[0].created_at)<2*HOUR) return null
  if(!force && Math.random()>=0.07) return null
  const template=encounterTemplates[Math.floor(Math.random()*encounterTemplates.length)]
  const npc=template.key==='npc_robbery'
    ? CITY_NPCS.filter(n=>n.id!=='mordek')[Math.floor(Math.random()*4)]
    : null
  const payload={title:template.title,text:template.text,options:template.options,npcName:npc?.name||null}
  if(npc) payload.text=`${npc.name} está andando sozinho pela noite. Ninguém parece estar olhando.`
  const {rows}=await db.query(`
    INSERT INTO alpha_city_encounters(jid,event_key,npc_id,payload,expires_at)
    VALUES($1,$2,$3,$4::jsonb,$5)
    RETURNING *
  `,[jid,template.key,npc?.id||null,JSON.stringify(payload),now+10*60])
  return rows[0]
}

export async function getPendingCityEncounter(jid){
  await ensureUser(jid)
  const {rows}=await db.query(`
    SELECT * FROM alpha_city_encounters
    WHERE jid=$1 AND status='pending' AND expires_at>${NOW_SQL}
    ORDER BY created_at DESC
    LIMIT 1
  `,[jid])
  return rows[0]||null
}

export async function resolveCityEncounter(jid,id,choice){
  await ensureUser(jid)
  choice=Number(choice)
  if(![1,2].includes(choice)) throw new Error('Escolha 1 ou 2.')
  const {rows}=await db.query(`
    SELECT * FROM alpha_city_encounters
    WHERE id=$1 AND jid=$2 AND status='pending' AND expires_at>${NOW_SQL}
    FOR UPDATE
  `,[Number(id),jid])
  const event=rows[0]
  if(!event) throw new Error('Esse evento já terminou.')
  const level=Number((await db.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]?.level||1)
  let result={eventKey:event.event_key,choice,cash:0,xp:0,karma:0,text:''}

  if(event.event_key==='monster_attack'){
    if(choice===1){
      const won=Math.random()<0.72
      if(won){
        result.cash=500+level*35
        result.xp=100+level*8
        result.karma=2
        result.text='⚔️ Você ajudou a expulsar o monstro. Os moradores viram quem ficou para lutar.'
        await db.query(`UPDATE wallets SET cash=cash+$1 WHERE jid=$2`,[result.cash,jid])
        await grantExp(jid,result.xp)
        await changeAlphaReputation(jid,'city_help',2).catch(()=>null)
        await changeCityReputation(jid,{trust:5,notoriety:-2})
      }else{
        const loss=Math.min(1500+level*20,Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0]?.cash||0))
        result.cash=-loss
        result.karma=1
        result.text='🩸 Você tentou defender a cidade, mas saiu ferido e perdeu dinheiro no caos. Mesmo assim, sua atitude foi lembrada.'
        if(loss>0) await db.query('UPDATE wallets SET cash=GREATEST(0,cash-$1) WHERE jid=$2',[loss,jid])
        await changeAlphaReputation(jid,'city_help',1).catch(()=>null)
        await changeCityReputation(jid,{trust:3,notoriety:-1})
      }
    }else{
      const seen=Math.random()<0.55
      result.karma=seen?-1:0
      result.text=seen?'👀 Você foi visto indo embora enquanto podia ajudar. A história começou a circular.':'🚶 Você foi embora. Desta vez ninguém parece ter ligado seu nome ao ocorrido.'
      if(seen){
        await changeAlphaReputation(jid,'city_ignore',-1).catch(()=>null)
        await changeCityReputation(jid,{trust:-3,notoriety:2})
      }
    }
  }else if(event.event_key==='npc_help'){
    if(choice===1){
      result.xp=60+level*4
      result.karma=2
      result.text='🤝 Você ajudou sem pedir nada em troca. O gesto virou assunto entre os moradores.'
      await grantExp(jid,result.xp)
      await changeAlphaReputation(jid,'city_help',2).catch(()=>null)
      await changeCityReputation(jid,{trust:5,notoriety:-1})
    }else{
      const seen=Math.random()<0.35
      result.karma=seen?-1:0
      result.text=seen?'😶 Alguém percebeu que você poderia ter ajudado e preferiu ignorar.':'🚶 Você seguiu caminho sem se envolver.'
      if(seen){
        await changeAlphaReputation(jid,'city_ignore',-1).catch(()=>null)
        await changeCityReputation(jid,{trust:-2,notoriety:1})
      }
    }
  }else if(event.event_key==='npc_robbery'){
    const npc=cityNpc(event.npc_id)
    if(choice===1){
      const success=Math.random()<0.55
      if(success){
        result.cash=700+level*30
        result.karma=-2
        result.text=`🥷 Você assaltou ${npc?.name||'o NPC'} e levou R$ ${result.cash.toLocaleString('pt-BR')}. Ele vai lembrar disso.`
        await db.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[result.cash,jid])
        await changeAlphaReputation(jid,'npc_robbery',-2).catch(()=>null)
        await changeCityReputation(jid,{trust:-5,notoriety:7})
        await db.query(`
          INSERT INTO alpha_city_incidents(kind,actor_jid,npc_id,amount,outcome,metadata)
          VALUES('npc_robbery',$1,$2,$3,'success',$4::jsonb)
        `,[jid,npc?.id||event.npc_id,result.cash,JSON.stringify({npcName:npc?.name||null})])
      }else{
        const fine=Math.min(800+level*15,Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0]?.cash||0))
        result.cash=-fine
        result.karma=-1
        result.text=`🚨 ${npc?.name||'O NPC'} percebeu a tentativa. Você foi pego e perdeu R$ ${fine.toLocaleString('pt-BR')}. Isso também será lembrado.`
        if(fine>0) await db.query('UPDATE wallets SET cash=GREATEST(0,cash-$1) WHERE jid=$2',[fine,jid])
        await changeAlphaReputation(jid,'npc_robbery',-1).catch(()=>null)
        await changeCityReputation(jid,{trust:-4,notoriety:5})
        await db.query(`
          INSERT INTO alpha_city_incidents(kind,actor_jid,npc_id,amount,outcome,metadata)
          VALUES('npc_robbery',$1,$2,$3,'caught',$4::jsonb)
        `,[jid,npc?.id||event.npc_id,fine,JSON.stringify({npcName:npc?.name||null})])
      }
    }else{
      result.text=`🌙 Você deixou ${npc?.name||'o NPC'} seguir em paz.`
      if(Math.random()<0.25){
        result.karma=1
        result.text+=' Alguém percebeu que você poderia ter se aproveitado e não fez isso.'
        await changeAlphaReputation(jid,'city_help',1).catch(()=>null)
        await changeCityReputation(jid,{trust:2,notoriety:-1})
      }
    }
  }

  await db.query(`
    UPDATE alpha_city_encounters SET status='resolved',resolved_at=${NOW_SQL}
    WHERE id=$1 AND jid=$2
  `,[event.id,jid])
  return result
}

function missionRewards(level){
  if(level>=80) return {cash:10000,xp:1400}
  if(level>=50) return {cash:6500,xp:900}
  if(level>=20) return {cash:3000,xp:500}
  return {cash:1500,xp:250}
}

export async function getBlackMarketMission(jid){
  await ensureUser(jid)
  const standing=await getCityStanding(jid)
  if(standing.karma>=0 && standing.notoriety<20){
    return {locked:true,standing,reason:'O Mercado Negro exige Karma negativo ou notoriedade 20+.'}
  }
  const period=periodNow()
  const existing=(await db.query(
    'SELECT * FROM alpha_black_market_missions WHERE jid=$1 AND period=$2',
    [jid,period]
  )).rows[0]
  if(existing) return {locked:false,mission:existing,standing}

  const player=(await db.query('SELECT level FROM users WHERE jid=$1',[jid])).rows[0]
  const level=Number(player?.level||1)
  const {rows:targets}=await db.query(`
    SELECT jid,push_name,level
    FROM users
    WHERE jid<>$1 AND level>20 AND banned=FALSE
    ORDER BY RANDOM()
    LIMIT 8
  `,[jid])
  const target=targets[0]
  if(!target) return {locked:false,mission:null,standing}
  const reward=missionRewards(level)
  const expiresAt=(period+1)*4*HOUR
  const {rows}=await db.query(`
    INSERT INTO alpha_black_market_missions(
      jid,period,target_jid,target_name,reward_cash,reward_xp,expires_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(jid,period) DO UPDATE SET jid=EXCLUDED.jid
    RETURNING *
  `,[jid,period,target.jid,target.push_name||'Alvo',reward.cash,reward.xp,expiresAt])
  return {locked:false,mission:rows[0],standing}
}

export async function progressBlackMarketMission(jid,targetJid,success){
  if(!success) return null
  const period=periodNow()
  const {rows}=await db.query(`
    UPDATE alpha_black_market_missions
    SET progress=1,status='completed'
    WHERE jid=$1 AND period=$2 AND status='active'
      AND target_jid=$3 AND expires_at>${NOW_SQL}
    RETURNING *
  `,[jid,period,targetJid])
  const mission=rows[0]
  if(!mission) return null
  await db.query('UPDATE wallets SET cash=cash+$1 WHERE jid=$2',[mission.reward_cash,jid])
  const xpResult=await grantExp(jid,Number(mission.reward_xp||0))
  await changeAlphaReputation(jid,'black_market',-2).catch(()=>null)
  await changeCityReputation(jid,{trust:-3,notoriety:4})
  return {...mission,xpResult}
}

export function cityNpcCatalog(){
  return CITY_NPCS.map((n,i)=>({...n,number:i+1}))
}
