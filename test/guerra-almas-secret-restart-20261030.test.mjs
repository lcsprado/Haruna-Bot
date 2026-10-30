import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {guerraShuffleActions,guerraEnsureChoices,guerraSecretChoice,guerraPrivateMenu} from '../src/neon/guerra-almas-secret.js'
import {GUERRA_SECRET_ROUND_MS,guerraScoreRound,guerraObjective,guerraRoundAt,guerraRoundEnd,guerraSignupOpen} from '../src/neon/guerra-almas-rules.js'
const read=file=>readFileSync(new URL('../src/neon/'+file,import.meta.url),'utf8')
const game=read('guerra-almas-v2.js'),index=read('index.js')

test('8 rodadas de 2 minutos sem inscrição inicial (16 minutos)',()=>{
 assert.equal(GUERRA_SECRET_ROUND_MS,120000)
 assert.equal(8*GUERRA_SECRET_ROUND_MS,960000)
 assert.equal(guerraRoundAt(1e6,1e6,{joinMs:0,roundMs:GUERRA_SECRET_ROUND_MS}),1)
 assert.equal(guerraRoundAt(1e6,1120000,{joinMs:0,roundMs:GUERRA_SECRET_ROUND_MS}),2)
 assert.equal(guerraRoundEnd(1e6,8,{joinMs:0,roundMs:GUERRA_SECRET_ROUND_MS}),1960000)
 assert.equal(guerraSignupOpen({start:1e6,now:1239999,joinMs:0,roundMs:GUERRA_SECRET_ROUND_MS}),true)
 assert.equal(guerraSignupOpen({start:1e6,now:1240000,joinMs:0,roundMs:GUERRA_SECRET_ROUND_MS}),false)
})

test('números 1/2/3 embaralhados por jogador e rodada, sem vazamento ao grupo',()=>{
 const a={name:'Ana',team:'sombras',plays:{}},b={name:'Bruno',team:'infernal',plays:{}}
 let i=0;const r1=guerraEnsureChoices(a,1,()=>0)
 const r2=guerraEnsureChoices(b,1,()=>1)
 assert.deepEqual([...r1].sort(),['atacar','defender','saquear'])
 assert.deepEqual([...r2].sort(),['atacar','defender','saquear'])
 assert.notDeepEqual(r1,r2)
 assert.strictEqual(guerraEnsureChoices(a,1,()=>{throw Error('não pode sortear de novo')}),r1)
 assert.ok(guerraPrivateMenu(a,1).includes('1️⃣'))
 assert.equal(guerraSecretChoice(a,1,'2'),r1[1])
 assert.equal(guerraSecretChoice(a,1,'4'),null)
 assert.equal(guerraSecretChoice(a,2,'1'),null)
})

test('pontuação nova: 10 por jogar, 8 contragolpe e 4 missão',()=>{
 const mission=guerraObjective(1).action
 const p={a:{name:'Ana',team:'sombras',plays:{1:mission}},b:{name:'Bruno',team:'infernal',plays:{1:'saquear'}}}
 const r=guerraScoreRound(p,1,{objectiveBonus:true})
 assert.equal(r.awards.a.objective,true)
 assert.ok(r.awards.a.points>=14)
 assert.equal(r.totalActions,2)
})

test('cancela anterior sem pagamentos e arquiva antes de zerar, preservando JIDs/equipes',()=>{
 assert.match(game,/const ARCHIVE=KEY\+':cancelled-before-secret-restart'/)
 assert.match(game,/await c\.query\('INSERT INTO trevo_settings\(key,value,updated_at\).*ON CONFLICT\(key\) DO NOTHING'/)
 assert.match(game,/s\.players=Object\.fromEntries\(members\.map/)
 assert.match(game,/team:p\.team,plays:\{\},secretOptions:\{\}/)
 assert.match(game,/s\.results=\[\]/)
 assert.match(game,/s\.resolvedRound=0/)
 assert.match(game,/s\.notices=\[\]/)
 assert.match(game,/s\.end=now\+GUERRA_ROUNDS\*GUERRA_SECRET_ROUND_MS/)
 assert.match(game,/if\(s\.secretEdition===EDITION\)return/)
 assert.match(game,/if\(s\.final\)/)
 assert.match(game,/state.*secretEdition|s\.secretEdition=EDITION/)
 assert.doesNotMatch(game,/socket\.sendMessage\(.*GUERRA_ACTIONS\[action\]/)
})

test('opções só pelo PV, comando numérico publicamente não revela ação',()=>{
 assert.match(game,/await sock\.sendMessage\(sender,\{text:outcome\.menu\}\)/)
 assert.match(game,/if\(pv\)\{await reply\(outcome\.menu\)/)
 assert.match(game,/guerraSecretChoice\(p,round,sub\)/)
 assert.match(game,/p\.plays\[String\(round\)\]=action/)
 assert.match(game,/escolha número \*/)
 assert.match(game,/Escolhas? reveladas?|ESCOLHAS REVELADAS/)
 assert.match(game,/if\(p\.plays\[String\(round\)\]\)/)
 assert.match(game,/GROUPS=Object\.freeze\(\['120363410230588690@g\.us','120363429534634131@g\.us'\]\)/)
 assert.match(index,/from '\.\/guerra-almas-v2\.js'/)
 assert.doesNotMatch(index,/from '\.\/guerra-almas\.js'/)
})
