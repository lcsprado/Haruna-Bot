// Politica unica de atividades incompatíveis com mineração.
// Importada por Sleep, Carpinar, Raidlote e mineração, sem dependência circular.
export function miningHomologationEnabled(env=process.env){
  if(env.ALPHA_MINING_MODE!=='homologation'||env.ALPHA_MINING_DB_CONFIRMED!=='test-only')return false
  try {
    const dbName=decodeURIComponent(new URL(env.DATABASE_URL||'').pathname.slice(1))
    return /^(alpha_test|alpha_homolog)(?:_[a-z0-9_]+)?$/.test(dbName)
  }catch{return false}
}
export function assertMiningHomologation(env=process.env){
  if(!miningHomologationEnabled(env))
    throw new Error('Mineração exige banco isolado alpha_test/alpha_homolog e flags de homologação.')
}
export async function miningActivityLock(client,jid){
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['raid-membership:'+jid])
}
export async function assertNoActiveMining(client,jid,now=Math.floor(Date.now()/1000)){
  if(!miningHomologationEnabled())return
  const current=(await client.query(
    "SELECT ends_at FROM mining_expeditions WHERE jid=$1 AND status='running' AND ends_at>$2 LIMIT 1",[jid,now]
  )).rows[0]
  if(current)throw new Error('⛏️ Você está minerando. Aguarde a expedição terminar ou use !minerar cancelar.')
}
