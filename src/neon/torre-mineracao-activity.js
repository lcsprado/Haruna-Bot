// Politica unica de atividades incompatíveis com mineração.
// O modo de homologação mantém banco isolado; produção exige liberação
// explícita do proprietário e nome/host verificados do banco Aiven.
export function miningHomologationEnabled(env=process.env){
  if(env.ALPHA_MINING_MODE!=='homologation'||env.ALPHA_MINING_DB_CONFIRMED!=='test-only')return false
  try {
    const dbName=decodeURIComponent(new URL(env.DATABASE_URL||'').pathname.slice(1))
    return /^(alpha_test|alpha_homolog)(?:_[a-z0-9_]+)?$/.test(dbName)
  }catch{return false}
}
export function miningProductionApproved(env=process.env){
  if(env.ALPHA_MINING_MODE!=='production-approved'||
     env.ALPHA_MINING_DB_CONFIRMED!=='alpha-prod-v2-owner-approved'||
     env.ALPHA_MINING_OWNER_APPROVED!=='2026-11-24-release')return false
  try{
    const db=new URL(env.DATABASE_URL||'')
    return ['postgres:','postgresql:'].includes(db.protocol)&&
      db.hostname.endsWith('.aivencloud.com')&&
      decodeURIComponent(db.pathname.slice(1))==='alpha_prod_v2'
  }catch{return false}
}
export function miningRuntimeEnabled(env=process.env){
  return miningHomologationEnabled(env)||miningProductionApproved(env)
}
export function assertMiningRuntime(env=process.env){
  if(!miningRuntimeEnabled(env))
    throw new Error('Mineração bloqueada: banco não autorizado ou flags de liberação ausentes.')
}
export function assertMiningHomologation(env=process.env){
  if(!miningHomologationEnabled(env))
    throw new Error('Mineração exige banco isolado alpha_test/alpha_homolog e flags de homologação.')
}
export async function miningActivityLock(client,jid){
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+jid])
}
export async function assertNoActiveMining(client,jid,now=Math.floor(Date.now()/1000)){
  if(!miningRuntimeEnabled())return
  const current=(await client.query(
    "SELECT ends_at FROM mining_expeditions WHERE jid=$1 AND status='running' AND ends_at>$2 LIMIT 1",[jid,now]
  )).rows[0]
  if(current)throw new Error('⛏️ Você está minerando. Aguarde a expedição terminar ou use !minerar cancelar.')
}

// Compartilhado por abertura/entrada de Raid e reserva do Raidlote.
// Chamadores de novas atividades já detêm a trava raid-membership do jogador.
export async function getActiveRest(client,jid,now=Math.floor(Date.now()/1000)){
  const row=(await client.query(`
    SELECT CASE
      WHEN EXISTS(SELECT 1 FROM player_sleep WHERE jid=$1 AND ends_at>$2) THEN 'sleep'
      WHEN EXISTS(SELECT 1 FROM player_carpinar WHERE jid=$1 AND ends_at>$2) THEN 'carpinar'
      ELSE NULL END AS activity
  `,[jid,now])).rows[0]
  return row?.activity||null
}
export async function assertNoActiveRest(client,jid){
  const activity=await getActiveRest(client,jid)
  if(activity==='sleep')throw new Error('Você está dormindo. Termine o sono antes de iniciar uma Raid.')
  if(activity==='carpinar')throw new Error('Você está carpindo. Termine a jornada antes de iniciar uma Raid.')
}
