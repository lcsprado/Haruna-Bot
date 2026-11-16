// Integração PostgreSQL real em serviço DESCARTÁVEL no GitHub Actions.
// Nunca recebe URL de bancos produtivos do Alpha Bot.
import test from 'node:test'
import assert from 'node:assert/strict'
import {pocoRunPlayerTransaction} from '../src/neon/poco-abismo-transaction.js'
import {
 pocoInitRewardLedger,pocoClaimCommandInTx,pocoClaimFloorInTx,pocoClaimBossDropInTx,pocoOpenBoxInTx,
 POCO_BOX_LEGEND_ID
} from '../src/neon/poco-abismo-rewards.js'
import {
 pocoSettleFinalRanking,POCO_LIVE_SETTLEMENT_KEY,POCO_LIVE_PLAYER_PREFIX
} from '../src/neon/poco-abismo-settlement.js'
import {POCO_SEASON,pocoStart,pocoScore,pocoDecision} from '../src/neon/poco-abismo-rules.js'
import {pocoStagePrompt,pocoConfirmPrompt,pocoMessageSeen,pocoRememberMessage,pocoDispatchActionPrompt,POCO_PENDING_DEADLINE} from '../src/neon/poco-abismo-delivery.js'
import {POCO_ABISMO_GEAR} from '../src/neon/poco-abismo-gear.js'

const connectionString=process.env.POCO_TEST_POSTGRES_URL
if(!connectionString){
 test.skip('PostgreSQL efêmero: apenas no job de integração com POCO_TEST_POSTGRES_URL',()=>{})
} else {
const parsed=new URL(connectionString)
if(!['postgres:', 'postgresql:'].includes(parsed.protocol)||
 !['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||parsed.search||parsed.hash)
 throw new Error('Teste PostgreSQL exige URL local sem parâmetros de conexão adicionais')
if(parsed.pathname!=='/poco_ci')
 throw new Error('Nome obrigatório do DB temporário: poco_ci')
process.env.DATABASE_URL=connectionString
const {default:pg}=await import('pg')
const pool=new pg.Pool({connectionString,max:3})
const user='poco@ci',key=POCO_LIVE_PLAYER_PREFIX+user
const stateParams={jid:user,name:'Jogador CI',key,
 settlementKey:POCO_LIVE_SETTLEMENT_KEY,season:POCO_SEASON.id,
 empty:name=>({season:POCO_SEASON.id,name,attempts:0,active:null,best:null,processed:[]}),
 now:()=>POCO_SEASON.startAt+10000}
async function setup(){
 await pool.query('CREATE TABLE users(jid TEXT PRIMARY KEY, level INTEGER NOT NULL DEFAULT 1, exp BIGINT NOT NULL DEFAULT 0, updated_at BIGINT DEFAULT 0)')
 await pool.query('CREATE TABLE stats(jid TEXT PRIMARY KEY REFERENCES users(jid), class_id TEXT, class_applied BOOLEAN NOT NULL DEFAULT FALSE)')
 await pool.query('CREATE TABLE player_class_levels(jid TEXT REFERENCES users(jid), class_id TEXT, level INTEGER, xp BIGINT)')
 await pool.query('CREATE TABLE player_hero_mode(jid TEXT PRIMARY KEY REFERENCES users(jid), hero_species TEXT)')
 await pool.query('CREATE TABLE pet_collection(jid TEXT REFERENCES users(jid), species TEXT)')
 await pool.query('CREATE TABLE wallets(jid TEXT PRIMARY KEY REFERENCES users(jid), cash BIGINT NOT NULL DEFAULT 0, updated_at BIGINT DEFAULT 0)')
 await pool.query('CREATE TABLE items(id TEXT PRIMARY KEY)')
 await pool.query('CREATE TABLE inventories(jid TEXT REFERENCES users(jid),item_id TEXT REFERENCES items(id),quantity INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(jid,item_id))')
 await pool.query('CREATE TABLE bound_inventory_items(jid TEXT REFERENCES users(jid),item_id TEXT REFERENCES items(id),source_key TEXT,quantity INTEGER NOT NULL,PRIMARY KEY(jid,item_id,source_key))')
 await pool.query('CREATE TABLE equipment_star_forges(jid TEXT REFERENCES users(jid),item_id TEXT REFERENCES items(id),stars INTEGER NOT NULL,level INTEGER NOT NULL,updated_at BIGINT DEFAULT 0,PRIMARY KEY(jid,item_id))')
 await pool.query('CREATE TABLE equipment_upgrade_copies(jid TEXT REFERENCES users(jid),item_id TEXT REFERENCES items(id),level INTEGER,quantity INTEGER,PRIMARY KEY(jid,item_id,level))')
 await pool.query('CREATE TABLE equipment_upgrades(jid TEXT REFERENCES users(jid),item_id TEXT REFERENCES items(id),level INTEGER NOT NULL,updated_at BIGINT DEFAULT 0,PRIMARY KEY(jid,item_id))')
 await pool.query('CREATE TABLE transactions(id BIGSERIAL PRIMARY KEY,from_jid TEXT,to_jid TEXT,amount BIGINT,type TEXT,note TEXT)')
 await pool.query('CREATE TABLE trevo_settings(key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_at BIGINT DEFAULT 0)')
 await pocoInitRewardLedger(pool)
 for(const jid of [user,'outro@ci','terceiro@ci']){
  await pool.query('INSERT INTO users(jid,level) VALUES($1,600)',[jid])
  await pool.query('INSERT INTO wallets(jid) VALUES($1)',[jid])
 }
 for(const id of [
  ...POCO_ABISMO_GEAR.map(x=>x.id),'caixa_epica_abissal_20261116',
  'caixa_lendaria_abissal_20261116','fragmento_universal_raid',
  'coroa_abissal','pocao_pet_epica','pocao_pet_suprema',
  'caixa_epica','caixa_lendaria','caixa_rara','pergaminho_experiencia'
 ])await pool.query('INSERT INTO items(id) VALUES($1)',[id])
}
const row=async(sql,params=[])=> (await pool.query(sql,params)).rows[0]
test('transação registra andar e EXP juntos ou não registra nada',async()=>{
 await setup()
 const begin=await pocoRunPlayerTransaction(pool,stateParams,async(c,s,now)=>{
  const start=pocoStart({now,seed:7,profile:{heroId:'pecado_ban',level:200}})
  s.attempts=1;s.active=start.state
  for(const floor of start.cleared)await pocoClaimFloorInTx(c,user,floor)
  return start.cleared
 })
 assert.deepEqual(begin,[1,2,3,4])
 const wallet=await row('SELECT cash FROM wallets WHERE jid=$1',[user])
 assert.equal(Number(wallet.cash),120000)
 const player=await row('SELECT exp FROM users WHERE jid=$1',[user])
 assert.equal(Number(player.exp),2000)
 const stored=await row('SELECT value FROM trevo_settings WHERE key=$1',[key])
 assert.equal(stored.value.active.floor,4)
 await assert.rejects(()=>pocoRunPlayerTransaction(pool,stateParams,async(c,s)=>{
  s.active.floor=5
  await pocoClaimFloorInTx(c,user,5)
  throw new Error('falha injetada depois do crédito')
 }),/falha injetada/)
 assert.equal(Number((await row('SELECT cash FROM wallets WHERE jid=$1',[user])).cash),120000)
 assert.equal(Number((await row('SELECT exp FROM users WHERE jid=$1',[user])).exp),2000)
 assert.equal((await row('SELECT value FROM trevo_settings WHERE key=$1',[key])).value.active.floor,4)
 const rollback=(await pool.query("SELECT claim_key FROM poco_abismo_claims WHERE claim_key='floor:5'")).rows
 assert.equal(rollback.length,0)
 // O mesmo andar pode ser pago após rollback, uma vez só.
 const result=await pocoRunPlayerTransaction(pool,stateParams,async(c,s)=>{
  s.active.floor=5
  return pocoClaimFloorInTx(c,user,5)
 })
 assert.equal(result.cash,30000)
 const repeat=await pocoRunPlayerTransaction(pool,stateParams,(c)=>pocoClaimFloorInTx(c,user,5))
 assert.equal(repeat.alreadyClaimed,true)
 assert.equal(Number((await row('SELECT cash FROM wallets WHERE jid=$1',[user])).cash),150000)
})

test('30 andares: valores naturais uma vez com a implementação real de EXP',async()=>{
 const finishSeason=()=>pocoRunPlayerTransaction(pool,stateParams,async c=>{
  const credits=[]
  for(let floor=1;floor<=POCO_SEASON.floorLimit;floor++)
   credits.push(await pocoClaimFloorInTx(c,user,floor))
  return credits
 })
 const first=await finishSeason()
 assert.equal(first.filter(x=>!x.alreadyClaimed).length,25)
 assert.ok((await finishSeason()).every(x=>x.alreadyClaimed))
 assert.equal(Number((await row('SELECT cash FROM wallets WHERE jid=$1',[user])).cash),3_500_000)
 const player=await row('SELECT level,exp FROM users WHERE jid=$1',[user])
 assert.equal(player.level,600)
 assert.equal(Number(player.exp),43_250)
})

test('drop lendário pronto e caixas: persistência, forja, deduplicação',async()=>{
 const gear=POCO_ABISMO_GEAR[0]
 const exclusive=await pocoRunPlayerTransaction(pool,stateParams,(c)=>
  pocoClaimBossDropInTx(c,user,10,'2026-11-16',()=>0))
 assert.equal(exclusive.kind,'exclusive')
 assert.equal(exclusive.itemId,gear.id)
 const forge=await row('SELECT stars,level FROM equipment_star_forges WHERE jid=$1 AND item_id=$2',[user,gear.id])
 assert.deepEqual({stars:forge.stars,level:forge.level},{stars:5,level:10})
 const bound=await row('SELECT quantity FROM bound_inventory_items WHERE jid=$1 AND item_id=$2',[user,gear.id])
 assert.equal(bound.quantity,1)
 const duplicate=await pocoRunPlayerTransaction(pool,stateParams,(c)=>
  pocoClaimBossDropInTx(c,user,10,'2026-11-16',()=>.9))
 assert.equal(duplicate.alreadyClaimed,true)
 const chest=await pocoRunPlayerTransaction(pool,stateParams,(c)=>
  pocoClaimBossDropInTx(c,user,15,'2026-11-16',()=>.006))
 assert.equal(chest.itemId,POCO_BOX_LEGEND_ID)
 const opened=await pocoRunPlayerTransaction(pool,stateParams,(c)=>
  pocoOpenBoxInTx(c,user,'legendary','msg-caixa-1',()=>.01))
 assert.equal(opened.kind,'box')
 const again=await pocoRunPlayerTransaction(pool,stateParams,(c)=>
  pocoOpenBoxInTx(c,user,'legendary','msg-caixa-1',()=>.9))
 assert.equal(again.alreadyClaimed,true)
 const inv=await row('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[user,POCO_BOX_LEGEND_ID])
 assert.equal(inv.quantity,0)
 const secondPlayer='outro@ci'
 for(const [index,floor] of POCO_SEASON.dropBossFloors.entries()){
  const expected=POCO_ABISMO_GEAR[index]
  const params={...stateParams,jid:secondPlayer,key:POCO_LIVE_PLAYER_PREFIX+secondPlayer}
  const prize=await pocoRunPlayerTransaction(pool,params,c=>
   pocoClaimBossDropInTx(c,secondPlayer,floor,'2026-11-17',()=>index*12/10_000))
  assert.equal(prize.itemId,expected.id)
  const forged=await row('SELECT stars,level FROM equipment_star_forges WHERE jid=$1 AND item_id=$2',[secondPlayer,expected.id])
  assert.deepEqual(forged,{stars:5,level:10})
  const equippedLevel=await row('SELECT level FROM equipment_upgrades WHERE jid=$1 AND item_id=$2',[secondPlayer,expected.id])
  assert.equal(equippedLevel.level,10)
 }
})
test('liquidação só depois do prazo e uma vez, sem jamais usar prévia',async()=>{
 const cutoff=await pocoSettleFinalRanking(pool,POCO_SEASON.endAt-1)
 assert.equal(cutoff.settled,false)
 const players=[{jid:user,floor:30,turns:72},{jid:'outro@ci',floor:30,turns:67},{jid:'terceiro@ci',floor:29,turns:45}]
 for(const p of players){
  const value={season:POCO_SEASON.id,name:p.jid,best:{jid:p.jid,name:p.jid,floor:p.floor,
   turns:p.turns,hp:250,potions:1,endedAt:POCO_SEASON.startAt+30000,completed:p.floor===30}}
  await pool.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
   [POCO_LIVE_PLAYER_PREFIX+p.jid,JSON.stringify(value)])
 }
 const fake={season:POCO_SEASON.id,best:{jid:'falso@ci',name:'falso',floor:30,turns:1}}
 await pool.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)',
  ['poco_abismo_preview_20261116:player:falso@ci',JSON.stringify(fake)])
 const missingWallet='terceiro@ci'
 await pool.query('DELETE FROM wallets WHERE jid=$1',[missingWallet])
 await assert.rejects(()=>pocoSettleFinalRanking(pool,POCO_SEASON.endAt+1),/Carteira não encontrada/)
 assert.equal((await pool.query("SELECT 1 FROM transactions WHERE type='poco_ranking'")).rowCount,0)
 assert.equal(await row('SELECT key FROM trevo_settings WHERE key=$1',[POCO_LIVE_SETTLEMENT_KEY]),undefined)
 await pool.query('INSERT INTO wallets(jid) VALUES($1)',[missingWallet])
 const settled=await pocoSettleFinalRanking(pool,POCO_SEASON.endAt+1)
 assert.deepEqual(settled.winners.map(p=>p.jid),['outro@ci',user,'terceiro@ci'])
 assert.deepEqual(settled.winners.map(p=>p.cash),[25000000,15000000,10000000])
 const again=await pocoSettleFinalRanking(pool,POCO_SEASON.endAt+2)
 assert.equal(again.alreadySettled,true)
 const prize=(await pool.query("SELECT amount,to_jid FROM transactions WHERE type='poco_ranking'")).rows
 assert.equal(prize.length,3)
 const values=new Map(prize.map(x=>[x.to_jid,Number(x.amount)]))
 assert.equal(values.get(user),15000000)
 assert.equal(values.get('outro@ci'),25000000)
 assert.equal(values.get('terceiro@ci'),10000000)
})
test('IDs de ação permanecem únicos em novas conexões, concorrência e rollback',async()=>{
 const run=messageId=>pocoRunPlayerTransaction(pool,stateParams,c=>pocoClaimCommandInTx(c,user,messageId))
 await assert.rejects(()=>pocoRunPlayerTransaction(pool,stateParams,async c=>{
  assert.equal(await pocoClaimCommandInTx(c,user,'id-rollback'),true)
  throw new Error('falha após marcar o comando')
 }),/falha após marcar/)
 assert.equal(await run('id-rollback'),true)
 assert.equal(await run('id-rollback'),false)
 const concurrent=await Promise.all([run('id-concorrente'),run('id-concorrente')])
 assert.deepEqual(concurrent.sort(),[false,true])
 for(let i=0;i<85;i++) assert.equal(await run('id-sequencia-'+i),true)
 assert.equal(await run('id-concorrente'),false)
})

test.after(async()=>{await pool.end()})

test('WhatsApp simulado + PostgreSQL: queda, reconexão, ACK e comando duplicado',async()=>{
 const jid='terceiro@ci'
 const scenario={...stateParams,jid,key:POCO_LIVE_PLAYER_PREFIX+jid,
  now:()=>POCO_SEASON.startAt+20000}
 const original=await pocoRunPlayerTransaction(pool,scenario,async(_c,s,at)=>{
  const created=pocoStart({now:at,seed:5,profile:{heroId:'pecado_ban'}})
  s.active=created.state
  pocoRememberMessage(s,'inicio-1')
  return pocoStagePrompt(s.active)
 })
 assert.equal(original.seq,1)
 const fail=()=>pocoDispatchActionPrompt({
  reply:async()=>{throw new Error('WA desconectado')},message:'Decisão',token:original,
  confirm:async()=>{throw Error('Nunca confirmar antes de enviar')}
 })
 await assert.rejects(fail,/WA desconectado/)
 const lost=(await row('SELECT value FROM trevo_settings WHERE key=$1',[scenario.key])).value
 assert.equal(lost.active.deadline,POCO_PENDING_DEADLINE)
 assert.equal(lost.active.deliveryPending,true)
 assert.equal(lost.active.floor,4)
 const newToken=await pocoRunPlayerTransaction(pool,scenario,async(_c,s)=>{
  assert.equal(pocoMessageSeen(s,'inicio-1'),true)
  assert.equal(s.active.floor,4)
  return pocoStagePrompt(s.active)
 })
 assert.equal(newToken.seq,2)
 const sentAt=POCO_SEASON.startAt+50000
 const sent=await pocoDispatchActionPrompt({
  reply:async()=>({key:{id:'send-confirmado'}}),message:'Resolução pendente',
  token:newToken,clock:()=>sentAt,
  confirm:(token,now)=>pocoRunPlayerTransaction(pool,scenario,async(_c,s)=>
   pocoConfirmPrompt(s.active,token,now))
 })
 assert.deepEqual(sent,{sent:true,confirmed:true})
 const staleAck=await pocoRunPlayerTransaction(pool,scenario,async(_c,s)=>
  pocoConfirmPrompt(s.active,original,sentAt+100))
 assert.equal(staleAck,false)
 const saved=(await row('SELECT value FROM trevo_settings WHERE key=$1',[scenario.key])).value
 assert.equal(saved.active.deliveryPending,false)
 assert.equal(saved.active.deadline,sentAt+120000)
 const turns=await pocoRunPlayerTransaction(pool,scenario,async(_c,s,at)=>{
  assert.equal(pocoMessageSeen(s,'decisao-1'),false)
  s.active=pocoDecision(s.active,2,{now:at}).state
  pocoRememberMessage(s,'decisao-1')
  return s.active.turns
 })
 const duplicate=await pocoRunPlayerTransaction(pool,scenario,async(_c,s)=>{
  if(pocoMessageSeen(s,'decisao-1'))return {duplicate:true,turns:s.active.turns}
  throw new Error('Processaria decisão duas vezes')
 })
 assert.equal(duplicate.duplicate,true)
 assert.equal(duplicate.turns,turns)
 const final=(await row('SELECT value FROM trevo_settings WHERE key=$1',[scenario.key])).value
 assert.equal(final.active.turns,turns)
 assert.equal(final.active.floor,4)
})

}
