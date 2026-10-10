import { db, ensureUser } from './db.js'
import { getPlayerClass } from './game-catalog.js'

// Progressão por missões; dinheiro somente ao concluir um despertar.
// Valores pactuados I–V. Nenhuma passiva ou dano é alterado nesta etapa.
const NOW='EXTRACT(EPOCH FROM NOW())::BIGINT'
export const AWAKENING_TIERS=[
  {stage:2,roman:'II',level:150,cost:600000,hp:30,atk:6,def:6,mult:10},
  {stage:3,roman:'III',level:200,cost:1200000,hp:45,atk:9,def:9,mult:20}
]
const PATHS={
  warrior:{name:'Vanguarda de Ferro',quests:[['raid',2,10,'Vencer Raids de vanguarda'],['pvp',2,0,'Vencer duelos de honra']]},
  assassin:{name:'Sombra Imortal',quests:[['pvp',4,0,'Vencer duelos furtivos'],['raid',1,20,'Concluir incursões furtivas']]},
  mage:{name:'Arcanista Supremo',quests:[['raid',2,15,'Vencer incursões arcanas'],['boss',1,0,'Contribuir para derrotas de Bosses']]},
  archer:{name:'Caçador de Titãs',quests:[['raid',2,20,'Vencer caçadas de Raid'],['boss',1,0,'Contribuir para derrotas de Bosses']]},
  paladin:{name:'Guardião da Luz',quests:[['raid',3,20,'Proteger aliados em Raids vitoriosas'],['pvp',1,0,'Vencer um duelo de honra']]},
  berserker:{name:'Fúria Ancestral',quests:[['pvp',4,0,'Vencer combates diretos'],['raid',1,25,'Derrubar titãs em Raid']]},
  monk:{name:'Punho Iluminado',quests:[['pvp',3,0,'Vencer duelos disciplinados'],['raid',2,10,'Dominar Raids']]},
  necromancer:{name:'Senhor das Almas',quests:[['raid',2,20,'Vencer masmorras sombrias'],['boss',1,0,'Contribuir para derrotas de Bosses']]},
  druid:{name:'Guardião da Natureza',quests:[['raid',2,15,'Vencer jornadas naturais'],['boss',1,0,'Contribuir para derrotas de Bosses']]},
  samurai:{name:'Lâmina Ascendente',quests:[['pvp',3,0,'Vencer duelos de espada'],['raid',2,30,'Superar provações lendárias']]}
}
async function tx(fn){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    const result=await fn(c)
    await c.query('COMMIT')
    return result
  }catch(err){
    await c.query('ROLLBACK')
    throw err
  }finally{c.release()}
}
export async function initAwakening(){
  await db.query(`CREATE TABLE IF NOT EXISTS player_awakenings(
    jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    stage INTEGER NOT NULL DEFAULT 1 CHECK(stage BETWEEN 0 AND 5),
    baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at BIGINT NOT NULL DEFAULT (${NOW}),
    updated_at BIGINT NOT NULL DEFAULT (${NOW})
  )`)
  await tx(async c=>{
    await c.query(`CREATE TABLE IF NOT EXISTS awakening_migrations(id TEXT PRIMARY KEY)`)
    const migration=await c.query(`INSERT INTO awakening_migrations(id) VALUES('three_stage_20261010') ON CONFLICT DO NOTHING RETURNING id`)
    if(migration.rowCount){
      // Stage 1 is the shared starting point. Keep earned stats and wallet untouched.
      await c.query(`UPDATE player_awakenings SET stage=1,baseline='{}'::jsonb,updated_at=${NOW}`)
      console.log('[Despertar] migração única: todos os registros no estágio I, atributos preservados')
    }
  })
  console.log('[Despertar] progressão I/II/III (níveis 100/150/200); fase I inicial')
}
async function getMetrics(c,jid){
  const [st,log]=await Promise.all([
    c.query('SELECT win FROM stats WHERE jid=$1',[jid]),
    c.query(`SELECT note,COUNT(*)::int AS total FROM transactions
       WHERE from_jid='system' AND to_jid=$1 AND type='minigame'
       AND (note LIKE 'raid_%' OR note LIKE 'boss_%') GROUP BY note`,[jid])
  ])
  const raids={};let boss=0
  for(const r of log.rows){
    const note=String(r.note||'')
    const match=/^raid_(\d+)$/.exec(note)
    if(match)raids[match[1]]=Number(r.total||0)
    else if(/^boss_(common|weekend|event_.*)$/.test(note))boss+=Number(r.total||0)
  }
  return {pvp:Number(st.rows[0]?.win||0),boss,raids}
}
async function getPlayer(c,jid,locked=false){
  return (await c.query(`SELECT u.level,s.class_id,w.cash,w.bank FROM users u
   JOIN stats s ON s.jid=u.jid JOIN wallets w ON w.jid=u.jid WHERE u.jid=$1
   ${locked?'FOR UPDATE OF u,s,w':''}`,[jid])).rows[0]
}
function since(start,now,type,minRaid){
  if(type!=='raid')return Math.max(0,Number(now[type]||0)-Number(start?.[type]||0))
  return Object.keys(now.raids||{}).reduce((sum,lvl)=>
    Number(lvl)>=minRaid?sum+Math.max(0,Number(now.raids[lvl]||0)-Number(start?.raids?.[lvl]||0)):sum,0)
}
// baseline pertence ao estágio atual, não à jornada inteira.
function checkpoint(metrics,stage){
  return {...metrics,__stage:stage}
}
async function normalizeAwakeningStage(c,jid,row,current){
  const stage=Number(row.stage||0)
  // Corrige jogadores que já despertaram na versão antiga. A migração acontece
  // uma única vez, na próxima consulta, sem reduzir estágio ou atributos.
  // Preserva progresso em Despertar I (stage 0) iniciado anteriormente.
  if(stage>0&&Number(row.baseline?.__stage)!==stage){
    const baseline=checkpoint(current,stage)
    await c.query(`UPDATE player_awakenings
      SET baseline=$2::jsonb,updated_at=${NOW} WHERE jid=$1`,
      [jid,JSON.stringify(baseline)])
    console.log('[Despertar] progresso de missões reiniciado após migração',JSON.stringify({stage}))
    return {...row,baseline}
  }
  return row
}
function progress(row,u,counters){
  const stage=Number(row.stage??1),tier=AWAKENING_TIERS.find(t=>t.stage===stage+1)||null
  const classId=String(u.class_id||'warrior'),path=PATHS[classId]||PATHS.warrior
  const quests=tier?path.quests.map(([type,amount,level,label])=>{
    const raidMin=type==='raid'?Math.max(level,tier.stage===2?40:60):0
    const target=amount*tier.mult
    const done=Math.min(target,since(row.baseline,counters,type,raidMin))
    return {label:label+(type==='raid'?` (Lv.${raidMin}+)`:''),target,done}
  }):[]
  return {stage,tier,classId,className:getPlayerClass(classId).name,path:path.name,
    level:Number(u.level),balance:Number(u.cash)+Number(u.bank),quests,
    ready:!!tier&&Number(u.level)>=tier.level&&quests.every(q=>q.done>=q.target)}
}
export async function getAwakeningStatus(jid){
  await ensureUser(jid)
  return tx(async c=>{
    const u=await getPlayer(c,jid)
    if(!u)throw new Error('Personagem não encontrado.')
    // O lock evita aplicar a migração duas vezes quando o jogador consulta
    // os mesmos requisitos em comandos simultâneos.
    let row=(await c.query('SELECT * FROM player_awakenings WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    const current=await getMetrics(c,jid)
    if(!row){
      await c.query(`INSERT INTO player_awakenings(jid,baseline) VALUES($1,$2::jsonb)
        ON CONFLICT(jid) DO NOTHING`,[jid,JSON.stringify(checkpoint(current,1))])
      row=(await c.query('SELECT * FROM player_awakenings WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    }
    row=await normalizeAwakeningStage(c,jid,row,current)
    return progress(row,u,current)
  })
}
export async function awakenCharacter(jid){
  await ensureUser(jid)
  return tx(async c=>{
    const u=await getPlayer(c,jid,true)
    if(!u)throw new Error('Personagem não encontrado.')
    let row=(await c.query('SELECT * FROM player_awakenings WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!row)throw new Error('Inicie suas missões com !despertar.')
    const current=await getMetrics(c,jid)
    row=await normalizeAwakeningStage(c,jid,row,current)
    const s=progress(row,u,current),tier=s.tier
    if(!tier)throw new Error('Despertar III já concluído; estágio máximo.')
    if(s.level<tier.level)throw new Error(`Despertar ${tier.roman} exige nível ${tier.level}.`)
    if(s.quests.some(q=>q.done<q.target))throw new Error('Missões pendentes: '+s.quests.filter(q=>q.done<q.target).map(q=>`${q.label}: ${q.done}/${q.target}`).join(' • '))
    if(s.balance<tier.cost)throw new Error(`Faltam R$ ${(tier.cost-s.balance).toLocaleString('pt-BR')} para o Despertar ${tier.roman}.`)
    const payCash=Math.min(Number(u.cash),tier.cost)
    await c.query(`UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at=${NOW} WHERE jid=$3`,[payCash,tier.cost-payCash,jid])
    await c.query(`UPDATE stats SET max_hp=max_hp+$1,atk=atk+$2,def=def+$3,updated_at=${NOW}
      WHERE jid=$4`,[tier.hp,tier.atk,tier.def,jid])
    // Ao desbloquear o próximo Despertar, os contadores recomeçam em zero.
    // Checkpoint e estágio na mesma transação das recompensas e do pagamento.
    await c.query(`UPDATE player_awakenings
      SET stage=$2,baseline=$3::jsonb,updated_at=${NOW} WHERE jid=$1`,
      [jid,tier.stage,JSON.stringify(checkpoint(current,tier.stage))])
    await c.query(`INSERT INTO transactions(from_jid,to_jid,amount,type,note)
      VALUES($1,'awakening',$2,'awakening',$3)`,[jid,tier.cost,`Despertar ${tier.roman} ${s.path}`])
    return {tier,path:s.path,classId:s.classId,className:s.className,balance:s.balance-tier.cost}
  })
}
