import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
const {Pool}=pg
import {initRaidLoteStore,purchaseRaidLote,cancelRaidLote,reserveNextRaidLoteAttempt,settleRaidLoteAttempt} from '../src/neon/raid-lote-store.js'

test('PostgreSQL real: pacote antecipado é atômico, idempotente e sem reembolso',async t=>{
  if(!process.env.RAID_LOTE_TEST_DATABASE_URL){
    t.skip('Requer PostgreSQL descartável e exclusivo do CI; nunca usar banco de produção')
    return
  }
  const db=new Pool({connectionString:process.env.RAID_LOTE_TEST_DATABASE_URL,max:4})
  const jid='raid-lote-integration@s.whatsapp.net'
  const catalog=()=>[{level:75,minLevel:75,keyPrice:480000,keyId:'raid_key_75'}]
  const request={jid,level:75,attempts:10,requestKey:'postgres-real-purchase-0001',confirmed:true}
  try{
    await db.query('CREATE TABLE users(jid TEXT PRIMARY KEY,level INTEGER NOT NULL)')
    await db.query('CREATE TABLE stats(jid TEXT PRIMARY KEY,hp BIGINT NOT NULL)')
    await db.query('CREATE TABLE inventories(jid TEXT NOT NULL,item_id TEXT NOT NULL,quantity INTEGER NOT NULL,PRIMARY KEY(jid,item_id))')
    await db.query('CREATE TABLE wallets(jid TEXT PRIMARY KEY,cash BIGINT NOT NULL,bank BIGINT NOT NULL)')
    await db.query('CREATE TABLE transactions(from_jid TEXT,to_jid TEXT,amount BIGINT,type TEXT,note TEXT)')
    await db.query('CREATE TABLE trevo_games(chat_jid TEXT,game_type TEXT,state JSONB NOT NULL)')
    await initRaidLoteStore(db)
    await db.query('INSERT INTO users VALUES($1,600)',[jid])
    await db.query('INSERT INTO stats VALUES($1,8000)',[jid])
    await db.query("INSERT INTO inventories VALUES($1,'raid_key_75',3)",[jid])
    await db.query('INSERT INTO wallets VALUES($1,2000000,4000000)',[jid])
    for(let n=0;n<3;n++)await db.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('raid_bot',$1,1000,'minigame','raid_75')",[jid])

    const first=await purchaseRaidLote(db,request,{getCatalog:catalog})
    assert.equal(first.alreadyPurchased,false)
    assert.equal(first.quote.totalPrice,3840000)
    assert.equal(first.quote.ownedKeysUsed,3)
    assert.equal(first.quote.keysToBuy,7)
    const second=await purchaseRaidLote(db,request,{getCatalog:catalog})
    assert.equal(second.alreadyPurchased,true)
    assert.equal(second.job.id,first.job.id)

    const wallet=(await db.query('SELECT cash,bank FROM wallets WHERE jid=$1',[jid])).rows[0]
    assert.equal(Number(wallet.cash),0)
    assert.equal(Number(wallet.bank),2160000)
    assert.equal(Number((await db.query('SELECT quantity FROM inventories WHERE jid=$1',[jid])).rows[0].quantity),0)
    assert.equal(Number((await db.query('SELECT balance FROM raid_lote_municipality WHERE id=1')).rows[0].balance),480000)
    assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM transactions WHERE type='raid_lote_service'")).rows[0].n),1)
    assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM raid_lote_jobs WHERE jid=$1",[jid])).rows[0].n),1)

    await assert.rejects(purchaseRaidLote(db,{...request,requestKey:'new-request-beyond-24h'},{getCatalog:catalog}),/Limite|andamento/)
    assert.ok(await cancelRaidLote(db,jid))
    assert.equal(Number((await db.query('SELECT bank FROM wallets WHERE jid=$1',[jid])).rows[0].bank),2160000)
    assert.equal(Number((await db.query('SELECT balance FROM raid_lote_municipality WHERE id=1')).rows[0].balance),480000)
    assert.equal((await db.query('SELECT status FROM raid_lote_jobs WHERE id=$1',[first.job.id])).rows[0].status,'cancelled')

    // Segunda conta fictícia no banco descartável: 10 vitórias sequenciais,
    // com liquidação repetida para comprovar idempotência e término exato.
    const secondJid='raid-lote-ten-wins@s.whatsapp.net'
    await db.query('INSERT INTO users VALUES($1,600)',[secondJid])
    await db.query('INSERT INTO stats VALUES($1,8000)',[secondJid])
    await db.query('INSERT INTO wallets VALUES($1,6000000,0)',[secondJid])
    for(let n=0;n<3;n++)await db.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('raid_bot',$1,1000,'minigame','raid_75')",[secondJid])
    const batch=await purchaseRaidLote(db,{
      jid:secondJid,level:75,attempts:10,requestKey:'postgres-real-ten-rounds-0002',confirmed:true
    },{getCatalog:catalog})
    assert.equal(batch.quote.totalPrice,5280000)
    for(let i=1;i<=10;i++){
      const next=await reserveNextRaidLoteAttempt(db,batch.job.id)
      assert.equal(next.status,'reserved')
      assert.equal(Number(next.attempt.seq),i)
      const at=1000000+i
      await db.query("UPDATE raid_lote_attempts SET status='active',raid_started_at_ms=$2,reward_summary=$3::jsonb WHERE id=$1",[
        next.attempt.id,at,JSON.stringify({rewards:[{cash:1000,exp:600}]})
      ])
      await db.query('INSERT INTO trevo_games(chat_jid,game_type,state) VALUES($1,$2,$3::jsonb)',[
        next.attempt.raid_chat,'raid:75',JSON.stringify({
          mode:'lote',loteAttemptId:next.attempt.id,startedAt:at,status:'completed'
        })
      ])
      const settled=await settleRaidLoteAttempt(db,next.attempt.id)
      assert.equal(settled.status,'won')
      assert.equal(settled.wins,i)
      assert.equal(settled.jobStatus,i===10?'won':'running')
      const replay=await settleRaidLoteAttempt(db,next.attempt.id)
      assert.equal(replay.status,'already_settled')
    }
    assert.equal((await db.query('SELECT status FROM raid_lote_jobs WHERE id=$1',[batch.job.id])).rows[0].status,'won')
    assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM raid_lote_attempts WHERE job_id=$1',[batch.job.id])).rows[0].n),10)
    assert.equal(Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[secondJid])).rows[0].cash),720000)

  }finally{await db.end()}
})
