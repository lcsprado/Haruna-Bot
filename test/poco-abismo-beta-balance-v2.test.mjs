import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 POCO_BETA_BALANCE,pocoStart,pocoDecision,pocoBossSkill,pocoScore,
 pocoBetaRankingCompare,pocoRankingCompare
} from '../src/neon/poco-abismo-rules.js'

const profile=heroId=>({heroId,level:520,effective_atk:1400,effective_def:1400})
const step=(state,choice)=>pocoDecision(state,choice,{now:state.deadline-1000}).state

test('a versão oficial mantém números e semântica antigos, beta só nas tentativas novas',()=>{
 const legacy=pocoStart({profile:profile('pecado_ban'),seed:100,now:1}).state
 const beta=pocoStart({profile:profile('pecado_ban'),seed:100,now:1,balanceVersion:POCO_BETA_BALANCE.id}).state
 assert.equal(legacy.balanceVersion,undefined)
 assert.equal(beta.balanceVersion,'beta-v2')
 assert.equal(legacy.boss.maxHp,2050)
 assert.equal(beta.boss.maxHp,2050)
 assert.equal(legacy.potions,2)
 assert.equal(beta.potions,2)
 assert.equal(legacy.skillCharges,5)
 assert.equal(beta.skillCharges,5)
 let old=legacy, experimental=beta
 while(old.boss?.floor===5)old=step(old,1)
 while(experimental.boss?.floor===5)experimental=step(experimental,1)
 assert.equal(old.boss.floor,10)
 assert.equal(experimental.boss.floor,10)
 assert.equal(old.boss.maxHp,2600)
 assert.equal(experimental.boss.maxHp,3250)
 assert.ok(experimental.hp>old.hp,'desgaste automático menor para evitar morrer fora do combate')
})

test('defender reduz dano e contra-ataca só no beta, técnica também melhora',()=>{
 const legacy=pocoStart({profile:profile('pecado_ban'),seed:10,now:1}).state
 const beta=pocoStart({profile:profile('pecado_ban'),seed:10,now:1,balanceVersion:'beta-v2'}).state
 const a=pocoDecision(legacy,2,{now:100})
 const b=pocoDecision(beta,2,{now:100})
 assert.equal(a.message.damage,0)
 assert.ok(b.message.damage>0)
 assert.equal(b.state.boss.hp,beta.boss.hp-b.message.damage)
 assert.equal(b.state.skillCharges,5)
 const specialOld=pocoDecision(legacy,4,{now:100})
 const specialNew=pocoDecision(beta,4,{now:100})
 assert.ok(specialNew.message.damage>specialOld.message.damage)
 assert.equal(specialNew.state.skillCharges,4)
})

test('desempate da prévia favorece sobrevivência em vez de punir defesa',()=>{
 const faster={jid:'a',floor:30,hp:584,maxHp:4562,turns:57,potions:0}
 const strategic={jid:'b',floor:30,hp:1500,maxHp:4562,turns:68,potions:0}
 assert.ok(pocoRankingCompare(faster,strategic)<0,'regra oficial antiga continua intacta')
 assert.ok(pocoBetaRankingCompare(strategic,faster)<0,'beta premia HP relativo')
 assert.ok(pocoBetaRankingCompare({...faster,floor:29},strategic)>0,'andar sempre manda primeiro')
 assert.ok(pocoBetaRankingCompare({...strategic,turns:65},{...strategic,turns:68})<0)
 const lowMax={...strategic,maxHp:3000,hp:1200}
 assert.ok(pocoBetaRankingCompare(lowMax,strategic)<0,'desempate deve usar percentual de vida, não HP bruto')
 const s=pocoStart({profile:profile('pecado_ban'),balanceVersion:'beta-v2'})
 assert.ok(pocoScore(s.state,'Teste','j').maxHp>0)
})

function simulate(seed,heroId,policy){
 let {state}=pocoStart({profile:profile(heroId),seed,now:1,balanceVersion:'beta-v2'})
 for(let i=0;i<180&&state.status==='active';i++){
   const skill=pocoBossSkill(state.boss.floor,state.boss.turn)
   let choice=1
   if(policy==='attacks-and-heals'){
     if(state.hp<state.stats.maxHp*.40&&state.potions)choice=3
   }else if(policy==='four-options'){
     if(state.hp<state.stats.maxHp*.58&&state.potions&&['barrier','bleed'].includes(skill.type))choice=3
     else if(skill.type==='charge'&&state.boss.hp>state.stats.atk*1.15)choice=2
     else if(['drain','bleed'].includes(skill.type)&&state.skillCharges&&state.boss.hp>state.stats.atk*.8)choice=4
   }
   state=step(state,choice)
 }
 return state.status==='completed'
}
test('ruptura avisada pune ataque cego, defender reduz 75% e regras oficiais continuam iguais',()=>{
 const old=pocoStart({profile:profile('pecado_ban'),seed:18,now:100}).state
 const beta=pocoStart({profile:profile('pecado_ban'),seed:18,now:100,balanceVersion:'beta-v2'}).state
 old.boss.turn=3
 beta.boss.turn=3
 assert.equal(pocoBossSkill(5,3).type,'charge')
 assert.equal(POCO_BETA_BALANCE.unblockedChargeFactor,2.4)
 const oldHit=pocoDecision(old,1,{now:101})
 const betaHit=pocoDecision(beta,1,{now:101})
 const betaBlock=pocoDecision(beta,2,{now:101})
 assert.equal(oldHit.message.damage,betaHit.message.damage)
 assert.ok(betaHit.message.enemyDamage>oldHit.message.enemyDamage*1.30)
 assert.ok(betaBlock.message.enemyDamage<=betaHit.message.enemyDamage*.26)
 assert.ok(betaBlock.message.damage>0,'defesa deve contra-atacar no beta')
 assert.equal(old.boss.hp,2050,'a chamada não pode consumir o estado original')
})

test('simulação determinística: sem bloquear rupturas, completar o Poço é raro',()=>{
 for(const heroId of ['pecado_ban','pecado_diane','pecado_meliodas']){
   let simple=0,strategic=0
   for(let seed=1;seed<=60;seed++){
     if(simulate(seed,heroId,'attacks-and-heals'))simple++
     if(simulate(seed,heroId,'four-options'))strategic++
   }
   assert.ok(simple<=3,`${heroId}: atacar e curar ainda vence demais (${simple}/60)`)
   assert.ok(strategic>=35,`${heroId}: o jogador estratégico não consegue terminar (${strategic}/60)`)
   assert.ok(strategic-simple>=30,`${heroId}: estratégia não cria vantagem real (${strategic} vs ${simple})`)
 }
})

test('preview inicia beta-v3, preserva beta-v2 antigo e nenhuma recompensa real',()=>{
 const preview=readFileSync(new URL('../src/neon/poco-abismo-preview.js',import.meta.url),'utf8')
 const live=readFileSync(new URL('../src/neon/poco-abismo-live.js',import.meta.url),'utf8')
 assert.match(preview,/balanceVersion:BETA_ONLY\?'beta-v3':'legacy'/)
 assert.match(preview,/\.sort\(BETA_ONLY\?pocoBetaRankingCompare:pocoRankingCompare\)/)
 assert.match(preview,/Defender'\+\(BETA_ONLY\?' \(reduz dano e contra-ataca\)'/)
 assert.doesNotMatch(preview,/pocoClaimFloorInTx|pocoClaimBossDropInTx|pocoSettleFinalRanking/)
 assert.doesNotMatch(live,/beta-v2|POCO_BETA_BALANCE/)
})
