import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 POCO_BETA_BALANCE,POCO_BETA_BALANCE_V3,pocoStart,pocoDecision,pocoBossSkill
} from '../src/neon/poco-abismo-rules.js'
import {pocoBetaEditTarget,pocoBetaCompactPrompt,pocoBetaCompactEnd,pocoBetaDispatchPrompt} from '../src/neon/poco-abismo-beta-ui.js'
import {pocoStagePrompt,pocoConfirmPrompt} from '../src/neon/poco-abismo-delivery.js'

const chat='120363999988887777@g.us'
const key={remoteJid:chat,id:'BOT-ORIGINAL-1',fromMe:true}
const profile=heroId=>({heroId,level:520,effective_atk:1400,effective_def:1400})
const step=(s,choice)=>pocoDecision(s,choice,{now:s.deadline-1000}).state

test('V2 antiga preservada, novas V3 têm ataques avisados perigosos no 10 e 15',()=>{
 assert.equal(POCO_BETA_BALANCE.id,'beta-v2')
 assert.equal(POCO_BETA_BALANCE_V3.id,'beta-v3')
 const v2=pocoStart({profile:profile('pecado_ban'),seed:3,now:1,balanceVersion:'beta-v2'}).state
 const v3=pocoStart({profile:profile('pecado_ban'),seed:3,now:1,balanceVersion:'beta-v3'}).state
 assert.equal(v2.balanceVersion,'beta-v2')
 assert.equal(v3.balanceVersion,'beta-v3')
 assert.equal(v2.boss.maxHp,v3.boss.maxHp)
 // Situação equivalente no Guardião 15: mesma habilidade anunciada.
 const boss={floor:15,hp:4252,maxHp:4252,turn:1}
 const old={...v2,floor:14,boss:{...boss},hp:v2.stats.maxHp}
 const newer={...v3,floor:14,boss:{...boss},hp:v3.stats.maxHp}
 assert.equal(pocoBossSkill(15,1).type,'charge')
 const oldHit=pocoDecision(old,1,{now:old.deadline-1000}).message.enemyDamage
 const newHit=pocoDecision(newer,1,{now:newer.deadline-1000}).message.enemyDamage
 const block=pocoDecision(newer,2,{now:newer.deadline-1000}).message.enemyDamage
 assert.ok(newHit>=oldHit*2.48,'Ruptura V3 15 deve ser 2,5x mais forte sem bloqueio')
 assert.ok(block<=newHit*.26,'Defesa corta 75% do dano')
})

function run(seed,heroId,policy){
 let {state}=pocoStart({profile:profile(heroId),seed,now:1,balanceVersion:'beta-v3'})
 for(let i=0;i<160&&state.status==='active';i++){
   const skill=pocoBossSkill(state.boss.floor,state.boss.turn)
   let choice=1
   if(policy==='attack-and-heal'){
     if(state.hp<state.stats.maxHp*.40&&state.potions)choice=3
   } else if(policy==='strategy'){
     if(state.hp<state.stats.maxHp*.58&&state.potions&&['barrier','bleed'].includes(skill.type))choice=3
     else if(skill.type==='charge'&&state.boss.hp>state.stats.atk*1.15)choice=2
     else if(['drain','bleed'].includes(skill.type)&&state.skillCharges&&state.boss.hp>state.stats.atk*.8)choice=4
   }
   state=step(state,choice)
 }
 return state
}

test('V3 não deixa atacante cego chegar ao Guardião 20; estratégia pode vencer',()=>{
 for(const heroId of ['pecado_ban','pecado_diane','pecado_meliodas']){
   let blindReach20=0,healWin=0,smartWin=0
   for(let seed=1;seed<=80;seed++){
     if(run(seed,heroId,'attack').floor>=20)blindReach20++
     if(run(seed,heroId,'attack-and-heal').status==='completed')healWin++
     if(run(seed,heroId,'strategy').status==='completed')smartWin++
   }
   assert.equal(blindReach20,0,heroId+' ainda chega ao 20 somente atacando')
   assert.ok(healWin<=1,heroId+' ainda conclui sem defender: '+healWin)
   assert.ok(smartWin>=30,heroId+' estratégia ficou inviável: '+smartWin)
 }
})

test('interface curta mantém opções, HP e habilidade visíveis, sem blocos de 10 linhas',()=>{
 const state=pocoStart({profile:profile('pecado_ban'),seed:12,balanceVersion:'beta-v3',now:1}).state
 const message=pocoBetaCompactPrompt({state,name:'LP',recap:'⚔️+700/-100'})
 assert.match(message,/G5\/30/)
 assert.match(message,/⚠️/)
 assert.match(message,/1⚔️ Atacar/)
 assert.match(message,/2🛡️ Defender/)
 assert.match(message,/3🧪 Curar/)
 assert.match(message,/4✨ Técnica/)
 assert.equal(message.split('\n').length,4)
 assert.ok(message.length<300,'balão beta ficou grande: '+message.length)
 const final=pocoBetaCompactEnd({name:'LP',report:{reason:'death',floor:19,turns:32,hp:0,maxHp:4562,potions:2},recap:'⚔️+510/-216'})
 assert.ok(final.length<220)
 assert.equal(final.split('\n').length,3)
})

test('seleciona edição só no mesmo jogador, chat, Guardião e janela válida',()=>{
 const session={chat,uiPrompt:{floor:5,key,at:1000}}
 assert.deepEqual(pocoBetaEditTarget(session,chat,5,1001),{key,at:1000})
 assert.equal(pocoBetaEditTarget(session,chat,10,1001),null)
 assert.equal(pocoBetaEditTarget(session,'outro@g.us',5,1001),null)
 assert.equal(pocoBetaEditTarget(session,chat,5,1000+12*60*1000),null)
 assert.equal(pocoBetaEditTarget({...session,uiPrompt:{floor:5,key:{...key,fromMe:false},at:1000}},chat,5,1001),null)
})

test('edita balão original e reinicia 120 segundos após ACK sem criar outro balão',async()=>{
 const state=pocoStart({profile:profile('pecado_ban'),seed:3,now:1,balanceVersion:'beta-v3'}).state
 const token=pocoStagePrompt(state),calls=[]
 const result=await pocoBetaDispatchPrompt({
   reply:async(msg,extra)=>{calls.push({msg,extra});return {key:{remoteJid:chat,id:'EDIT-ACK-1',fromMe:true}}},
   message:'mensagem compacta',token,uiEdit:{key,at:1000},clock:()=>2200,
   confirm:async(t,sentAt,ui)=>{
     assert.deepEqual(ui,{key,at:1000},'próxima edição precisa usar a chave ORIGINAL')
     return pocoConfirmPrompt(state,t,sentAt)
   }
 })
 assert.equal(result.confirmed,true)
 assert.equal(state.deadline,122200)
 assert.equal(calls.length,1)
 assert.deepEqual(calls[0].extra,{edit:key})
})

test('se edição falhar, cria balão novo; falha total não inicia relógio',async()=>{
 const calls=[]
 const result=await pocoBetaDispatchPrompt({
   reply:async(_msg,extra)=>{calls.push(extra);if(extra?.edit)throw Error('edicao nao suportada');return {key:{remoteJid:chat,id:'NOVO',fromMe:true}}},
   message:'prompt',token:{seq:1},uiEdit:{key,at:1000},clock:()=>2200,
   confirm:async(_tok,sentAt,ui)=>{
     assert.equal(sentAt,2200)
     assert.equal(ui.key.id,'NOVO')
     assert.equal(ui.at,2200)
     return true
   }
 })
 assert.equal(result.confirmed,true)
 assert.equal(calls.length,2)
 assert.equal(calls[1],undefined)
 let confirms=0
 const noAck=await pocoBetaDispatchPrompt({
   reply:async()=>({}),message:'prompt',token:{seq:1},
   confirm:async()=>{confirms++;return true},clock:()=>2200
 })
 assert.equal(noAck.confirmed,false)
 assert.equal(confirms,0)
})

test('roteador não usa edição nos controladores de pagamento real',()=>{
 const preview=readFileSync(new URL('../src/neon/poco-abismo-preview.js',import.meta.url),'utf8')
 const live=readFileSync(new URL('../src/neon/poco-abismo-live.js',import.meta.url),'utf8')
 const main=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(preview,/balanceVersion:BETA_ONLY\?'beta-v3':'legacy'/)
 assert.match(preview,/if\(BETA_ONLY\)\{\s*return pocoBetaDispatchPrompt/)
 assert.match(preview,/pocoBetaEditTarget\(s,chat,s\.active\.boss\.floor,now\)/)
 assert.doesNotMatch(live,/pocoBetaDispatchPrompt|beta-v3/)
 assert.match(main,/destination\.quoted&&!extra\?\.edit/)
})
