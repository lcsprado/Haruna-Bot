// Integração real do bootstrap completo em PostgreSQL descartável, isolado da suíte de mineração.
// NUNCA usa credenciais remotas. Cria um segundo database apenas dentro do runner do GitHub Actions.
import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

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
    const {initEnchantments}=await import('../src/neon/enchantments-alpha.js')
    const {initRaidLoteStore}=await import('../src/neon/raid-lote-store.js')
    const {initMiningStore}=await import('../src/neon/torre-mineracao-store.js')
    await initEnchantments()
    await initRaidLoteStore(db)
    await initMiningStore(db)
    const {rows}=await db.query("SELECT to_regclass('public.pet_collection') AS pets,to_regclass('public.mining_expeditions') AS mining")
    assert.ok(rows[0].pets)
    assert.ok(rows[0].mining)
  }finally{
    if(db)await db.end()
  }
})
