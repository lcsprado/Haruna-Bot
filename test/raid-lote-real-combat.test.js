import test from 'node:test'
import assert from 'node:assert/strict'

// Usa EXCLUSIVAMENTE o PostgreSQL descartável provisionado pelo GitHub Actions.
// Não importar ou inicializar o motor sem a URL específica do CI.
const dsn=process.env.RAID_LOTE_TEST_DATABASE_URL

test('motor games.js real: compra, inicio, uma rodada, recompensa e liquidacao em PostgreSQL',async t=>{
  if(!dsn){
    t.skip('Motor real exige PostgreSQL descartavel exclusivo do CI');
    return
  }
  if(!dsn.includes('alpha_raid_lote_real_ci')||process.env.DATABASE_URL!==dsn)
    throw new Error('Homologacao do motor real bloqueada: banco nao isolado')
  const {db,initDatabase,initCommunityPack}=await import('../src/neon/db.js')
  const {initPlayableHeroes}=await import('../src/neon/playable-heroes.js')
  const {initAwakening}=await import('../src/neon/awakening.js')
  const {initRelics}=await import('../src/neon/relics.js')
  const {initEnchantments}=await import('../src/neon/enchantments-alpha.js')
  const {initGames,getRaidCatalog,createRaid,startRaid,raidRound}=await import('../src/neon/games.js')
  const {initRaidLoteStore,purchaseRaidLote,reserveNextRaidLoteAttempt,settleRaidLoteAttempt}=await import('../src/neon/raid-lote-store.js')
  const {createRaidLoteWorker}=await import('../src/neon/raid-lote-worker.js')
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
    const jid='5511999000011@s.whatsapp.net'
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

    // A partir daqui, testar rounds reais múltiplos, itens e pets.
    // Data virtual avança só no runner isolado para dispensar 8s de espera.
    const originalNow=Date.now,originalRandom=Math.random
    let clock=originalNow()+30000
    Date.now=()=>clock
    Math.random=()=>0.75
    try{
      const petJid='5511999000012@s.whatsapp.net'
      await db.query("INSERT INTO users(jid,level,push_name) VALUES($1,250,'Teste Real de Pet')",[petJid])
      await db.query('INSERT INTO wallets(jid,cash,bank) VALUES($1,500000,0)',[petJid])
      await db.query('INSERT INTO stats(jid,hp,max_hp,atk,def,spd) VALUES($1,8,100,2500,0,100)',[petJid])
      for(let i=0;i<3;i++)await db.query(
        "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('raid_bot',$1,1,'minigame',$2)",
        [petJid,'raid_'+cfg.level])
      await db.query("INSERT INTO pets(jid,species,name,level,xp,hp,max_hp,energy) VALUES($1,'cachorro','Pet real de teste',20,1900,20,300,30)",[petJid])
      await db.query("INSERT INTO pet_collection(jid,species,name,level,xp,hp,max_hp,energy,active) VALUES($1,'cachorro','Pet real de teste',20,1900,20,300,30,TRUE)",[petJid])
      await db.query("INSERT INTO inventories(jid,item_id,quantity) VALUES($1,'pocao_p',1),($1,'pocao_pet_suprema',1)",[petJid])
      const petPurchase=await purchaseRaidLote(db,{
        jid:petJid,level:cfg.level,attempts:1,requestKey:'real-multi-pet-002',confirmed:true
      },{getCatalog:()=>catalog})
      const petAttempt=(await reserveNextRaidLoteAttempt(db,petPurchase.job.id)).attempt
      const petRaid=await startRaid(petAttempt.raid_chat,petJid,cfg.level,{loteAttemptId:petAttempt.id})
      assert.equal(petRaid.status,'active')
      let petOutcome,rounds=0
      while(rounds<15){
        clock+=9000
        petOutcome=await raidRound(petAttempt.raid_chat,cfg.level)
        rounds++
        if(petOutcome.victory||petOutcome.failed)break
      }
      assert.equal(petOutcome?.victory,true,'Pet + poções devem permitir vitória após várias rodadas')
      assert.ok(rounds>=2,'A Raid precisa avançar por ao menos duas rodadas reais')
      const afterPet=(await db.query('SELECT quantity,item_id FROM inventories WHERE jid=$1 AND item_id IN ($2,$3)',[
        petJid,'pocao_p','pocao_pet_suprema'])).rows
      const qty=id=>Number(afterPet.find(x=>x.item_id===id)?.quantity||0)
      assert.equal(qty('pocao_p'),0,'Auto cura do jogador consome uma poção existente')
      assert.equal(qty('pocao_pet_suprema'),0,'Auto cura do pet consome uma poção existente')
      const petFinal=(await db.query('SELECT hp,energy,xp FROM pets WHERE jid=$1',[petJid])).rows[0]
      assert.ok(Number(petFinal.energy)<30,'Pet real gastou energia por rodada')
      const petReceipt=(await db.query('SELECT reward_summary FROM raid_lote_attempts WHERE id=$1',[petAttempt.id])).rows[0].reward_summary
      assert.ok(Number(petReceipt.rewards[0].petXp)>0,'O pet recebe XP reduzido pelo modo lote')
      assert.ok(Number(petReceipt.rewards[0].potionUses)>=1,'Relatório precisa incluir cura do jogador')
      assert.ok(Number(petReceipt.rewards[0].petPotionUses)>=1,'Relatório precisa incluir cura do pet')
      assert.equal((await settleRaidLoteAttempt(db,petAttempt.id)).jobStatus,'won')

      // Derrota real sem consumíveis deve encerrar todo o lote não utilizado.
      const deadJid='5511999000013@s.whatsapp.net'
      await db.query("INSERT INTO users(jid,level,push_name) VALUES($1,250,'Teste Derrota Real')",[deadJid])
      await db.query('INSERT INTO wallets(jid,cash,bank) VALUES($1,500000,0)',[deadJid])
      await db.query('INSERT INTO stats(jid,hp,max_hp,atk,def,spd) VALUES($1,1,50,1,0,5)',[deadJid])
      for(let i=0;i<3;i++)await db.query(
        "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('raid_bot',$1,1,'minigame',$2)",
        [deadJid,'raid_'+cfg.level])
      const deadPurchase=await purchaseRaidLote(db,{
        jid:deadJid,level:cfg.level,attempts:5,requestKey:'real-failure-003',confirmed:true
      },{getCatalog:()=>catalog})
      const deathAttempt=(await reserveNextRaidLoteAttempt(db,deadPurchase.job.id)).attempt
      await startRaid(deathAttempt.raid_chat,deadJid,cfg.level,{loteAttemptId:deathAttempt.id})
      clock+=9000
      const deathOutcome=await raidRound(deathAttempt.raid_chat,cfg.level)
      assert.equal(deathOutcome.failed,true,'O motor real deve registrar derrota ao perder todo HP')
      assert.equal(deathOutcome.reason,'party_wipe')
      const deathSettled=await settleRaidLoteAttempt(db,deathAttempt.id)
      assert.equal(deathSettled.jobStatus,'lost')
      assert.equal((await reserveNextRaidLoteAttempt(db,deadPurchase.job.id)).status,'inactive')
      const deathFunds=(await db.query('SELECT cash FROM wallets WHERE jid=$1',[deadJid])).rows[0]
      assert.equal(Number(deathFunds.cash),500000-deadPurchase.quote.totalPrice)
      const attemptsUsed=(await db.query('SELECT COUNT(*)::int AS n FROM raid_lote_attempts WHERE job_id=$1',[
        deadPurchase.job.id])).rows[0]
      assert.equal(Number(attemptsUsed.n),1,'4 tentativas restantes são perdidas; não executam nem reembolsam')

      // Dez combates reais, um por vez, gerenciados pelo worker verdadeiro.
      // Uma nova instância assume o mesmo pacote na metade, sem novo débito.
      const seriesJid='5511999000014@s.whatsapp.net'
      await db.query("INSERT INTO users(jid,level,push_name) VALUES($1,250,'Teste Dez Raids')",[seriesJid])
      await db.query('INSERT INTO wallets(jid,cash,bank) VALUES($1,5000000,0)',[seriesJid])
      await db.query('INSERT INTO stats(jid,hp,max_hp,atk,def,spd) VALUES($1,8000,8000,1200000,1500,1000)',[seriesJid])
      for(let i=0;i<3;i++)await db.query(
        "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('raid_bot',$1,1,'minigame',$2)",
        [seriesJid,'raid_'+cfg.level])
      const series=await purchaseRaidLote(db,{
        jid:seriesJid,level:cfg.level,attempts:10,requestKey:'real-ten-engine-004',confirmed:true
      },{getCatalog:()=>catalog})
      assert.equal(series.quote.ownedKeysUsed,0)
      let finished=0,workerErrors=[]
      const deps={
        db,startRaid,raidRound,
        onFinished:async(jid,jobId,outcome)=>{
          assert.equal(jid,seriesJid)
          assert.equal(String(jobId),String(series.job.id))
          assert.equal(outcome.jobStatus,'won')
          finished++
        },
        onError:async(jobId,error)=>workerErrors.push({jobId,error:String(error?.message||error)})
      }
      let worker=createRaidLoteWorker(deps)
      for(let tick=0;tick<26;tick++){
        if(tick===11)worker=createRaidLoteWorker(deps)
        clock+=9000
        const progress=await worker.tickOnce()
        assert.equal(progress.errors,0,'Worker real nao pode falhar: '+JSON.stringify(workerErrors))
        const status=(await db.query('SELECT status FROM raid_lote_jobs WHERE id=$1',[series.job.id])).rows[0].status
        if(status==='won')break
      }
      const complete=(await db.query('SELECT status,started,won_count FROM raid_lote_jobs WHERE id=$1',[series.job.id])).rows[0]
      assert.equal(complete.status,'won','O pacote precisa encerrar depois da décima vitória real')
      assert.equal(Number(complete.started),10)
      assert.equal(Number(complete.won_count),10)
      assert.equal(finished,1)
      assert.deepEqual(workerErrors,[])
      const ten=(await db.query('SELECT seq,status,reward_summary FROM raid_lote_attempts WHERE job_id=$1 ORDER BY seq',[
        series.job.id])).rows
      assert.equal(ten.length,10)
      assert.deepEqual(ten.map(x=>Number(x.seq)),[1,2,3,4,5,6,7,8,9,10])
      assert.ok(ten.every(x=>x.status==='won'))
      assert.ok(ten.every(x=>x.reward_summary?.rewards?.length===1))
      const cashExpected=Math.floor((
        Math.floor(cfg.keyPrice*1.08)+Math.floor(cfg.cashPool*.16)
      )*.8)
      assert.ok(ten.every(x=>Number(x.reward_summary.rewards[0].cash)===cashExpected),
        'Cada recompensa real deve ser reduzida a 80% sem bônus de evento')
      const xpExpected=Math.floor(cfg.xpPool*.6)
      assert.ok(ten.every(x=>Number(x.reward_summary.rewards[0].exp)===xpExpected),
        'Cada XP real deve ser reduzida a 60% sem bônus de evento')
      const balance=(await db.query('SELECT cash FROM wallets WHERE jid=$1',[seriesJid])).rows[0]
      assert.equal(Number(balance.cash),5000000-series.quote.totalPrice+10*cashExpected)

      // Raid 75 da collab em motor real: fragmentos precisam cair a 40%,
      // sem bônus temporários. Esse drop não é coberto pela Raid Lv10.
      const high= catalog.find(x=>x.level===75)
      assert.ok(high?.collab)
      const highJid='5511999000015@s.whatsapp.net'
      await db.query("INSERT INTO users(jid,level,push_name) VALUES($1,250,'Teste Raid 75')",[highJid])
      await db.query('INSERT INTO wallets(jid,cash,bank) VALUES($1,5000000,0)',[highJid])
      await db.query('INSERT INTO stats(jid,hp,max_hp,atk,def,spd) VALUES($1,8000,8000,1200000,1500,1000)',[highJid])
      for(let i=0;i<3;i++)await db.query(
        "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('raid_bot',$1,1,'minigame',$2)",
        [highJid,'raid_'+high.level])
      const collabBuy=await purchaseRaidLote(db,{
        jid:highJid,level:high.level,attempts:1,requestKey:'real-raid75-005',confirmed:true
      },{getCatalog:()=>catalog})
      const collabAttempt=(await reserveNextRaidLoteAttempt(db,collabBuy.job.id)).attempt
      clock+=9000
      await startRaid(collabAttempt.raid_chat,highJid,high.level,{loteAttemptId:collabAttempt.id})
      clock+=9000
      const collabWin=await raidRound(collabAttempt.raid_chat,high.level)
      assert.equal(collabWin.victory,true)
      const collabReport=(await db.query('SELECT reward_summary FROM raid_lote_attempts WHERE id=$1',[collabAttempt.id])).rows[0].reward_summary
      assert.equal(collabReport.rewards.length,1)
      assert.equal(collabReport.rewards[0].material?.qty,4,'10 fragmentos normais x 40% = 4')
      const collabInv=(await db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[
        highJid,high.material.id])).rows[0]
      assert.equal(Number(collabInv?.quantity),4)
      assert.equal((await settleRaidLoteAttempt(db,collabAttempt.id)).jobStatus,'won')

      // Regressão da Raid manual: continua comprando uma única chave,
      // lutando com o mesmo motor e recebendo a recompensa INTEGRAL.
      const manualJid='5511999000016@s.whatsapp.net'
      const manualChat='alpha-manual-raid-ci@g.us'
      await db.query("INSERT INTO users(jid,level,push_name) VALUES($1,250,'Teste Raid Manual')",[manualJid])
      await db.query('INSERT INTO wallets(jid,cash,bank) VALUES($1,500000,0)',[manualJid])
      await db.query('INSERT INTO stats(jid,hp,max_hp,atk,def,spd) VALUES($1,8000,8000,1200000,1500,1000)',[manualJid])
      const manualLobby=await createRaid(manualChat,manualJid,'Teste Raid Manual',cfg.level)
      assert.equal(manualLobby.autoKeyPurchased,true)
      const manualKey=await db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[
        manualJid,cfg.keyId])
      assert.equal(Number(manualKey.rows[0].quantity),1)
      const manualStart=await startRaid(manualChat,manualJid,cfg.level)
      assert.equal(manualStart.status,'active')
      assert.notEqual(manualStart.mode,'lote')
      const consumed=await db.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2',[
        manualJid,cfg.keyId])
      assert.equal(Number(consumed.rows[0].quantity),0)
      clock+=9000
      const manualWin=await raidRound(manualChat,cfg.level)
      assert.equal(manualWin.victory,true)
      const manualCash=Number(manualWin.rewards[0]?.cash||0)
      assert.ok(manualCash>cashExpected,
        'A Raid manual deve preservar a recompensa normal, maior que a do lote')
      const manualBalance=(await db.query('SELECT cash FROM wallets WHERE jid=$1',[manualJid])).rows[0]
      assert.equal(Number(manualBalance.cash),500000-cfg.keyPrice+manualCash)
      const manualTransactions=await db.query(
        "SELECT COUNT(*)::int AS n FROM transactions WHERE from_jid=$1 AND type='raid_key_auto'",
        [manualJid])
      assert.equal(manualTransactions.rows[0].n,1)

    }finally{
      Date.now=originalNow
      Math.random=originalRandom
    }
  }finally{
    await db.end()
  }
})
