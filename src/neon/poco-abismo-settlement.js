// Encerramento transacional do Poço do Abismo.
// NUNCA consulta o prefixo da prévia. Este módulo só pode ser conectado
// depois da homologação do controlador de produção.
import {POCO_SEASON,pocoRankingCompare} from './poco-abismo-rules.js'
import {pocoClaimRankPrizeInTx,pocoInitRewardLedger} from './poco-abismo-rewards.js'

export const POCO_LIVE_PLAYER_PREFIX='poco_abismo_live_20261116:player:'
export const POCO_LIVE_SETTLEMENT_KEY='poco_abismo_live_20261116:settlement'

export function pocoFinalLeaderboard(rows=[]){
 const unique=new Map()
 for(const entry of rows){
  const key=String(entry?.key||'')
  if(!key.startsWith(POCO_LIVE_PLAYER_PREFIX))continue
  if(entry?.value?.season!==POCO_SEASON.id)continue
  const jid=key.slice(POCO_LIVE_PLAYER_PREFIX.length)
  const best=entry.value.best
  const floor=Number(best?.floor),turns=Number(best?.turns)
  const hp=Number(best?.hp),potions=Number(best?.potions)
  const endedAt=Number(best?.endedAt)
  if(!jid||String(best?.jid||'')!==jid ||
    !Number.isInteger(floor)||floor<1||floor>30||
    !Number.isSafeInteger(turns)||turns<floor||
    !Number.isFinite(hp)||hp<0||
    !Number.isInteger(potions)||potions<0||
    !Number.isFinite(endedAt)||endedAt>POCO_SEASON.endAt ||
    endedAt<POCO_SEASON.startAt)continue
  const candidate={jid,name:String(best.name||entry.value.name||'Jogador').slice(0,48),
   floor,turns,hp,potions,endedAt,completed:best.completed===true}
  const previous=unique.get(jid)
  if(!previous||pocoRankingCompare(candidate,previous)<0)unique.set(jid,candidate)
 }
 return [...unique.values()].sort(pocoRankingCompare)
}

export async function pocoSettleFinalRanking(db,now=Date.now()){
 if(!Number.isFinite(now)||now<POCO_SEASON.endAt)
  return {settled:false,reason:'season_not_ended'}
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='30000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[POCO_LIVE_SETTLEMENT_KEY])
  const previous=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',
   [POCO_LIVE_SETTLEMENT_KEY])).rows[0]?.value
  if(previous?.settled===true){
   await c.query('COMMIT')
   return {...previous,alreadySettled:true}
  }
  // DDL idempotente na mesma transação: rollback desfaz tudo se falhar.
  await pocoInitRewardLedger(c)
  const {rows}=await c.query(
   "SELECT key,value FROM trevo_settings WHERE LEFT(key,LENGTH($1))=$1 AND value->>'season'=$2",
   [POCO_LIVE_PLAYER_PREFIX,POCO_SEASON.id])
  const ranked=pocoFinalLeaderboard(rows)
  const winners=[]
  for(let i=0;i<Math.min(3,ranked.length);i++){
   const winner=ranked[i]
   const award=await pocoClaimRankPrizeInTx(c,winner.jid,i+1)
   winners.push({...winner,position:i+1,cash:award.cash})
  }
  const settlement={settled:true,season:POCO_SEASON.id,closedAt:POCO_SEASON.endAt,
   settledAt:now,winners,eligibleCount:ranked.length}
  await c.query(`INSERT INTO trevo_settings(key,value,updated_at)
   VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint)
   ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
   [POCO_LIVE_SETTLEMENT_KEY,JSON.stringify(settlement)])
  await c.query('COMMIT')
  return {...settlement,alreadySettled:false}
 }catch(error){
  await c.query('ROLLBACK').catch(()=>{})
  throw error
 }finally{
  c.release()
 }
}
