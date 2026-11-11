import test from 'node:test'
import assert from 'node:assert/strict'

// Usa EXCLUSIVAMENTE o PostgreSQL descartável provisionado pelo GitHub Actions.
// Não importar ou inicializar o motor sem a URL específica do CI.
const dsn=process.env.RAID_LOTE_TEST_DATABASE_URL
if(!dsn||!dsn.includes('alpha_raid_lote_real_ci')||process.env.DATABASE_URL!==dsn)
  throw new Error('Homologação de motor real EXIGE banco descartável isolado alpha_raid_lote_real_ci')

const {db,initDatabase,initCommunityPack}=await import('../src/neon/db.js')
const {initPlayableHeroes}=await import('../src/neon/playable-heroes.js')
const {initAwakening}=await import('../src/neon/awakening.js')
const {initRelics}=await import('../src/neon/relics.js')
const {initEnchantments}=await import('../src/neon/enchantments-alpha.js')
const {initGames,getRaidCatalog,startRaid,raidRound}=await import('../src/neon/games.js')
const {initRaidLoteStore,purchaseRaidLote,reserveNextRaidLoteAttempt,settleRaidLoteAttempt}=await import('../src/neon/raid-lote-store.js')

test('motor games.js real: compra, inicio, uma rodada, recompensa e liquidacao em PostgreSQL',async()=>{
  try{
    // Primeiro init prepara users/group_settings e catálogo; a migração antiga
    // exige pets/pet_collection criados pelo initCommunityPack no fim do boot.
    try{await initDatabase()}catch(error){
      if(!/relation ["']?(pets|pet_collection)["']? does not exist/i.test(String(error.message||'')))throw error
    }
    await initCommunityPack()
    await initDatabase()
    await initPlayableHeroes()
    await initAwakening()
    await initRelics()
    await initEnchantments()
    await initGames()
    await initRaidLoteStore(db)

    const catalog=getRaidCatalog()
    const cfg=catalog.find(x=>x.level===10)
    assert.ok(cfg?.keyId&&cfg?.keyPrice>0,'A Raid Lv10 precisa constar no catálogo real')
    const jid='raid-real-ci-001@s.whatsapp.net'
    await db.query("INSERT INTO users(jid,level,push_name) VALUES($1,250,'Teste Motor Real')",[jid])
    await db.query("INSERT INTO wallets(jid,cash,bank) VALUES($1,5000000,0)",[jid])
    await db.query("INSERT INTO stats(jid,hp,max_hp,atk,def,spd) VALUES($1,9000,9000,1200000,1500,1200)",[jid])
    for(let i=0;i<3;i++)await db.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('raid_bot',$1,1,'minigame',$2)",
      [jid,'raid_'+cfg.level])

    const purchased=await purchaseRaidLote(db,{
      jid,level:cfg.level,attempts:1,requestKey:'real-engine-test-001',confirmed:true
    },{getCatalog:()=>catalog})
    assert.equal(purchased.job.status,'queued')
    const next=await reserveNextRaidLoteAttempt(db,purchased.job.id)
    assert.equal(next.status,'reserved')
    const raid=await startRaid(next.attempt.raid_chat,jid,cfg.level,{loteAttemptId:next.attempt.id})
    assert.equal(raid.status,'active','startRaid real deve criar combate ativo')
    assert.equal(raid.mode,'lote')
    const stored=(await db.query('SELECT status,raid_started_at_ms FROM raid_lote_attempts WHERE id=$1',[next.attempt.id])).rows[0]
    assert.equal(stored.status,'active')
    assert.equal(Number(stored.raid_started_at_ms),Number(raid.startedAt))
    const outcome=await raidRound(next.attempt.raid_chat,cfg.level)
    assert.equal(outcome.victory,true,'Dano alto do jogador deve vencer na primeira rodada')
    const battle=(await db.query('SELECT state FROM trevo_games WHERE chat_jid=$1 AND game_type=$2',[
      next.attempt.raid_chat,'raid:'+cfg.level])).rows[0]?.state
    assert.equal(battle.status,'completed')
    assert.equal(battle.round,1)
    const reward=(await db.query('SELECT reward_summary FROM raid_lote_attempts WHERE id=$1',[next.attempt.id])).rows[0].reward_summary
    assert.equal(reward.rewards.length,1,'Recibo transacional de recompensa precisa existir')
    assert.ok(reward.rewards[0].cash>0,'A vitória deve gerar recompensa reduzida')
    const done=await settleRaidLoteAttempt(db,next.attempt.id)
    assert.equal(done.status,'won')
    assert.equal(done.jobStatus,'won')
    assert.equal((await settleRaidLoteAttempt(db,next.attempt.id)).status,'already_settled')
    const wallet=(await db.query('SELECT cash FROM wallets WHERE jid=$1',[jid])).rows[0]
    assert.equal(Number(wallet.cash),5000000-purchased.quote.totalPrice+reward.rewards[0].cash)
  }finally{
    await db.end()
  }
})
