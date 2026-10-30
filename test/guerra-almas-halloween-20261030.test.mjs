import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GUERRA_JOIN_MS,GUERRA_TOTAL_MS,guerraRoundAt,guerraScoreRound,guerraBuildAwards,GUERRA_ROUNDS} from '../src/neon/guerra-almas-rules.js'
const read=f=>readFileSync(new URL('../src/neon/'+f,import.meta.url),'utf8')
const src=read('guerra-almas.js'),index=read('index.js')

test('5 minutos de inscrições mais 8 rodadas de 5 minutos = 45 minutos',()=>{
  assert.equal(GUERRA_JOIN_MS,300000)
  assert.equal(GUERRA_TOTAL_MS,2700000)
  assert.equal(GUERRA_ROUNDS,8)
  assert.equal(guerraRoundAt(1000000,1000000),0)
  assert.equal(guerraRoundAt(1000000,1300000),1)
  assert.equal(guerraRoundAt(1000000,1600000),2)
  assert.equal(guerraRoundAt(1000000,3700000),8)
})

test('estratégia contra oponente, não level/ATK ou número de pets',()=>{
  const players={
   a:{name:'A',team:'sombras',plays:{1:'atacar'}},
   b:{name:'B',team:'sombras',plays:{1:'atacar'}},
   c:{name:'C',team:'infernal',plays:{1:'saquear'}},
   d:{name:'D',team:'infernal',plays:{1:'saquear'}}
  }
  const r=guerraScoreRound(players,1)
  assert.equal(r.awards.a.points,18)
  assert.equal(r.awards.b.points,18)
  assert.equal(r.awards.c.points,10)
  assert.equal(r.scores.sombras,36)
  assert.equal(r.scores.infernal,20)
  assert.equal(r.totalActions,4)
  const alternative=guerraScoreRound({...players,a:{...players.a,level:100000,atk:999999,pets:123}},1)
  assert.deepEqual(alternative,r)
})

test('MVP único por facção recebe 1 lendária; almas 15/8 e XP por ações',()=>{
  const players={
   a:{name:'A',team:'sombras',plays:{1:'atacar',2:'defender'}},
   b:{name:'B',team:'sombras',plays:{1:'saquear',2:'atacar'}},
   c:{name:'C',team:'infernal',plays:{1:'saquear',2:'atacar'}},
   d:{name:'D',team:'infernal',plays:{1:'defender'}},
  }
  const results=[guerraScoreRound(players,1),guerraScoreRound(players,2)]
  const x=guerraBuildAwards(players,results)
  assert.equal(x.viable,true)
  assert.equal(x.rewards.length,3)
  assert.equal(x.rewards.filter(p=>p.legendary).length,2)
  assert.equal(x.rewards.filter(p=>p.team==='sombras'&&p.legendary).length,1)
  assert.equal(x.rewards.filter(p=>p.team==='infernal'&&p.legendary).length,1)
  assert.ok(x.rewards.every(p=>p.souls===15||p.souls===8))
  assert.ok(x.rewards.every(p=>p.xp===160))
})

test('sem confronto válido, sem farm de caixas lendárias',()=>{
  const players={
   a:{name:'A',team:'sombras',plays:{1:'atacar',2:'atacar'}},
   b:{name:'B',team:'infernal',plays:{1:'saquear'}}
  }
  const x=guerraBuildAwards(players,[guerraScoreRound(players,1),guerraScoreRound(players,2)])
  assert.equal(x.viable,false)
  assert.equal(x.winner,null)
  assert.equal(x.rewards.filter(p=>p.legendary).length,0)
  assert.equal(x.rewards[0].souls,8)
})

test('1 ação por pessoa por rodada e equipe imutável durante a disputa',()=>{
  assert.match(src,/if\(prev\)return '✅ Você já entrou/)
  assert.match(src,/if\(p\.plays\[String\(round\)\]\)return/)
  assert.match(src,/if\(count>rival\)return/)
  assert.match(src,/if\(!p\)return '⚠️ Você não está inscrito/)
  assert.match(src,/if\(chat!==GUERRA_GROUP\)/)
  assert.match(src,/const LAST_START=Date\.parse\('2026-10-30T22:00:00-03:00'\)/)
})

test('recompensas transacionais e não duplicadas em reinícios',()=>{
  assert.match(src,/if\(!state\|\|state\.final\)return/)
  assert.match(src,/state\.final=\{\.\.\.outcome,completedAt:Date\.now\(\)\}/)
  assert.match(src,/ON CONFLICT\(jid,item_id\) DO UPDATE SET quantity=inventories\.quantity\+EXCLUDED\.quantity/)
  assert.match(src,/INSERT INTO inventories\(jid,item_id,quantity\) VALUES\(\$1,'caixa_lendaria',1\)/)
  assert.match(src,/grantExpInTransaction\(c,r\.jid,r\.xp/)
  assert.match(src,/pg_advisory_xact_lock/)
  assert.match(src,/FOR UPDATE/)
  assert.match(src,/ROLLBACK/)
  assert.match(index,/startGuerraAlmasScheduler\(sock,\{isConnected:/)
  assert.match(index,/handleGuerraAlmasCommand\(\{cmd,args,sender/)
})
