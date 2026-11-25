// Integração real do bootstrap completo em PostgreSQL descartável, isolado da suíte de mineração.
// NUNCA usa credenciais remotas. Cria um segundo database apenas dentro do runner do GitHub Actions.
import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomUUID} from 'node:crypto'

const validate=(env=process.env)=>{
  const url=new URL(env.DATABASE_URL||'')
  if(env.ALPHA_MINING_E2E_PG!=='1'||env.ALPHA_MINING_MODE!=='homologation'||env.ALPHA_MINING_DB_CONFIRMED!=='test-only'||
     !['localhost','127.0.0.1','::1'].includes(url.hostname)||
     !/^alpha_homolog_[a-z0-9_]+$/.test(url.pathname.slice(1)))throw new Error('Full boot só permitido no PostgreSQL efêmero localhost.')
  return url
}
test('inicialização completa de esquema do Alpha Bot em PostgreSQL local', {skip:process.env.ALPHA_MINING_E2E_PG!=='1'},async()=>{
  const origin=validate()
  const adminUrl=new URL(origin);adminUrl.pathname='/postgres'
  const uniqueDb='alpha_homolog_fullboot'
  const client=new pg.Client({connectionString:adminUrl.toString()})
  await client.connect()
  try{await client.query('CREATE DATABASE '+uniqueDb)}finally{await client.end()}
  const isolatedUrl=new URL(origin);isolatedUrl.pathname='/'+uniqueDb
  process.env.DATABASE_URL=isolatedUrl.toString()
  let db
  try{
    const base=await import('../src/neon/db.js')
    db=base.db
    await base.initDatabase()
    await base.initCommunityPack()
    const {initEnchantments,listAppliedStoneUpgrades,upgradeAppliedStone,getEquippedEnchants}=await import('../src/neon/enchantments-alpha.js')
    const {initRaidLoteStore}=await import('../src/neon/raid-lote-store.js')
    const {initMiningStore}=await import('../src/neon/torre-mineracao-store.js')
    await initEnchantments()
    await initRaidLoteStore(db)
    await initMiningStore(db)
    const {rows}=await db.query("SELECT to_regclass('public.pet_collection') AS pets,to_regclass('public.mining_expeditions') AS mining")
    assert.ok(rows[0].pets)
    assert.ok(rows[0].mining)
    // Activate V2 only after safe local bootstrap. Existing legacy rows remain Lv.1.
    process.env.ALPHA_REBOOT_MODE='classes_only'
    const jid='stone-test@s.whatsapp.net',stoneId='pedra_forca_rara_alpha'
    await base.ensureUser(jid,'Test stone')
    const itemId=(await db.query("SELECT id FROM items WHERE category='weapon' AND id NOT LIKE 'pecados_%' ORDER BY id LIMIT 1")).rows[0].id
    await db.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)',[jid,itemId])
    await db.query('INSERT INTO equipment_enchantments(jid,item_id,stone_id,quantity) VALUES($1,$2,$3,2)',[jid,itemId,stoneId])
    await db.query('UPDATE wallets SET cash=1000 WHERE jid=$1',[jid])
    const picks=await listAppliedStoneUpgrades(jid)
    assert.equal(picks.length,2);assert.deepEqual(picks[0].levels,[1,1])
    assert.equal((await getEquippedEnchants(db,jid,[itemId])).atk,20)
    const req={...picks[0],token:randomUUID()}
    const result=await upgradeAppliedStone(jid,req)
    assert.equal(result.outcome,'success');assert.equal(result.cash,400)
    assert.deepEqual(await upgradeAppliedStone(jid,req),result)
    const next=await listAppliedStoneUpgrades(jid)
    assert.deepEqual(next[0].levels,[2,1]);assert.ok((await getEquippedEnchants(db,jid,[itemId])).atk>20)
    await assert.rejects(upgradeAppliedStone(jid,{...req,token:randomUUID()}),/alterado/)
    await assert.rejects(upgradeAppliedStone(jid,{...next[1],token:randomUUID()}),/Saldo insuficiente/)
    assert.equal(Number((await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0].cash),400)
    assert.equal(Number((await db.query("SELECT count(*) FROM transactions WHERE from_jid=$1 AND type='stone_upgrade'",[jid])).rows[0].count),1)
    process.env.ALPHA_REBOOT_MODE=''

  }finally{
    if(db)await db.end()
  }
})
