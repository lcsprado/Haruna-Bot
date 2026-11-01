import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatPvpBattleReport} from '../src/neon/pvp-report.js'

const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const sample=()=>({
  ok:true,
  opening:{
    attacker:{jid:'a',name:'~LP🍀☘️',hp:2504,maxHp:2504,atk:623,def:537,spd:204,crit:.263,petName:'Dragão Corrompido'},
    defender:{jid:'b',name:'João Pedro',hp:1824,maxHp:2724,atk:685,def:677,spd:242,crit:.2,petName:'Fera do Caos'}
  },
  log:[
    {round:1,from:'João Pedro',fromJid:'b',to:'~LP🍀☘️',toJid:'a',dmg:450,actualDamage:450,hp:2054},
    {round:1,from:'~LP🍀☘️',fromJid:'a',to:'João Pedro',toJid:'b',dmg:300,actualDamage:300,hp:1524},
    {round:2,from:'João Pedro',fromJid:'b',to:'~LP🍀☘️',toJid:'a',dmg:0,actualDamage:0,hp:2054,dodged:true},
    {round:2,from:'~LP🍀☘️',fromJid:'a',to:'João Pedro',toJid:'b',dmg:560,actualDamage:560,hp:964,crit:true},
    {round:2,petHeal:true,from:'~LP🍀☘️',fromJid:'a',heal:100,hp:2154},
    {round:3,from:'~LP🍀☘️',fromJid:'a',to:'João Pedro',toJid:'b',dmg:1200,actualDamage:964,hp:0}
  ],
  roundCount:3,ending:{attackerHp:2154,defenderHp:0},decidedByLimit:false,
  winner:{jid:'a',name:'~LP🍀☘️',hp:2154},loser:{jid:'b',name:'João Pedro',hp:0},
  reward:928,winXpGain:40,loseXpGain:15,eventMultiplier:1,winExp:{levels:0},loseExp:{levels:0}
})

test('mostra HP e atributos iniciais, pet ativo e o histórico completo',()=>{
  const report=formatPvpBattleReport(sample())
  assert.match(report,/2\.504\/2\.504/)
  assert.match(report,/1\.824\/2\.724/)
  assert.match(report,/Dragão Corrompido/)
  assert.match(report,/Primeiro ataque: \*João Pedro\*/)
  for(const n of [1,2,3])assert.ok(report.includes('Rodada '+n))
  assert.match(report,/560 dano/)
  assert.match(report,/🌀 ~LP🍀☘️ esquivou/)
  assert.match(report,/1\.824 dano efetivo/)
  assert.match(report,/HP restante/)
})
test('HP efetivamente removido exclui dano além do nocaute',()=>{
  const r=sample()
  assert.equal(r.log[5].dmg,1200)
  assert.equal(r.log[5].actualDamage,964)
  assert.match(formatPvpBattleReport(r),/1\.824 dano efetivo/)
})
test('o relatório contabiliza cura de pet e habilidades de classe sem confundir os dois',()=>{
  const r=sample()
  r.log.push({round:3,classHeal:true,from:'~LP🍀☘️',fromJid:'a',heal:50,hp:2204})
  const report=formatPvpBattleReport(r)
  assert.match(report,/habilidade da classe/)
  assert.match(report,/\+150 HP curados/)
})

test('quando o duelo chega ao limite, informa decisão por HP restante',()=>{
  const r=sample();r.decidedByLimit=true;r.roundCount=20
  assert.match(formatPvpBattleReport(r),/Limite de 20 rodadas/)
})
test('o resultado usa os valores de início do combate, não o recorte final',()=>{
  assert.match(db,/const opening=\{attacker:snapshot\(A\),defender:snapshot\(B\)\}/)
  assert.match(db,/actualDamage:targetHpBefore-to\.hp/)
  assert.match(db,/round:from\.attackIndex/)
  assert.match(db,/const decidedByLimit=A\.hp>0&&B\.hp>0/)
  assert.match(db,/ok:true,winner,loser,reward,log,opening,ending,pvpMetrics,roundCount,decidedByLimit/)
})
test('comando direto e fluxo interativo usam mesmo relatório sem corte de seis ações',()=>{
  assert.equal(app.split('formatPvpBattleReport(r)').length-1,2)
  assert.doesNotMatch(app,/const last=r\.log\.slice\(-6\)/)
})

test('relatorio identifica Ban, arma correta e bônus real de collab no PvP',()=>{
  const r=sample();
  r.opening.attacker.heroId='pecado_ban';
  r.opening.attacker.heroMasteryStage=1;
  r.opening.attacker.heroGear={weapon:true,armor:false,attack:.015,defense:0,heal:.005};
  const msg=formatPvpBattleReport(r);
  assert.match(msg,/Personagem: \*Ban\* • Maestria 1\/5/);
  assert.match(msg,/Arma correspondente \+1,5% dano/);
  assert.match(msg,/Armadura correspondente não equipada/);
  assert.match(msg,/cura periódica somente a partir do 6º ataque/);
  assert.match(db,/heroGear:fighter\.heroId\?fighter\.heroGear:null/);
});
test('relatorio identifica habilidades dos heróis sem confundir cura com classe',()=>{
  const r=sample();
  r.opening.attacker.heroId='pecado_ban';
  r.opening.attacker.heroMasteryStage=2;
  r.opening.attacker.heroGear={weapon:true,armor:true,attack:.015,defense:.02,heal:.005};
  r.log[1].heroTechnique='Snatch';
  r.log.push({round:3,classHeal:true,from:'~LP🍀☘️',fromJid:'a',heal:50,hp:2204});
  const msg=formatPvpBattleReport(r);
  assert.match(msg,/Técnica: \*Snatch\*/);
  assert.match(msg,/habilidade de Ban/);
  assert.match(msg,/Armadura correspondente -2% dano recebido/);
  assert.doesNotMatch(msg,/Ban.*habilidade da classe/);
});
