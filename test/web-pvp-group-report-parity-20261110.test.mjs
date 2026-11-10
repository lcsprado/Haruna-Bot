import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatPvpBattleReport} from '../src/neon/pvp-report.js'
const webSource=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
const reportSource=readFileSync(new URL('../src/neon/pvp-report.js',import.meta.url),'utf8')

function duel(){
 const a={jid:'alpha-a',name:'Alpha A',heroId:'pecado_ban',heroMasteryStage:5,
  heroGear:{weapon:true,armor:true,attack:.05,defense:.04},
  hp:7300,maxHp:8500,atk:1400,def:1100,spd:540,crit:.87,
  petName:'Fênix Alpha',petPvpBonus:{damage:.1,defense:.06,crit:.05,dodge:.03},
  vitalHpRate:.08,vitalPulseRate:.05,shieldName:'Escudo Rúnico',shieldCritResist:.1044,shieldCritGuard:.174}
 const b={jid:'alpha-b',name:'Alpha B',heroId:'pecado_diane',heroMasteryStage:4,
  hp:7200,maxHp:8200,atk:1120,def:1400,spd:470,crit:.42}
 const log=[]
 for(let round=1;round<=20;round++){
  log.push({round,from:a.name,fromJid:a.jid,to:b.name,toJid:b.jid,dmg:120,actualDamage:120,
   hp:Math.max(0,7200-round*120),crit:round%3===0,heroTechnique:round===6?'Snatch':undefined})
  log.push({round,from:b.name,fromJid:b.jid,to:a.name,toJid:a.jid,dmg:80,actualDamage:80,
   hp:Math.max(0,7300-round*80),defenseTechnique:round===7?'Gideon':undefined,defenseBlocked:round===7?120:0})
 }
 log.push({round:8,petHeal:true,vitalPulse:true,from:a.name,fromJid:a.jid,heal:425,hp:5700})
 return {ok:true,opening:{attacker:a,defender:b},log,roundCount:20,
  ending:{attackerHp:5800,defenderHp:4800},decidedByLimit:true,
  winner:{jid:a.jid,name:a.name,hp:5800},loser:{jid:b.jid,name:b.name,hp:4800},
  reward:1200,winXpGain:40,loseXpGain:15}
}
test('AB-01: relatório integral preserva 20 rodadas sem cortar as últimas 8',()=>{
 const out=formatPvpBattleReport(duel())
 for(let round=1;round<=20;round++)assert.match(out,new RegExp('Rodada '+round+'(?:\\D|$)'))
 assert.match(out,/Limite de 20 rodadas/)
 assert.match(out,/1\.200/)
 assert.match(out,/Snatch/)
 assert.match(out,/Gideon/)
 assert.match(out,/Coração Eterno/)
 assert.match(out,/Escudo Rúnico/)
 assert.match(out,/Maestria 5\/5/)
 assert.match(out,/personagem/i)
})
test('AB-01: bônus e HP de pet continuam apenas informação de combate',()=>{
 const out=formatPvpBattleReport(duel())
 assert.match(out,/HP de combate \+8%/)
 assert.match(out,/cura uma vez abaixo de 35%/)
 assert.match(out,/dano efetivo/)
 assert.match(out,/HP ao fim das trocas/)
})
test('AB-01: a notificação Web usa o mesmo formatador WhatsApp e conserva o cooldown',()=>{
 assert.match(webSource,/import \{formatPvpBattleReport\} from '\.\/pvp-report\.js'/)
 assert.match(webSource,/else if\(actionName==='battle'\)\{\s*if\(result\.ok===false\)\{/)
 assert.match(webSource,/text=formatPvpBattleReport\(result\)/)
 assert.match(webSource,/mentions=\[me,result\.targetJid,result\.winner\.jid,result\.loser\.jid\]\.filter\(Boolean\)/)
 assert.doesNotMatch(webSource,/const hits=Array\.isArray\(result\.log\)/)
 assert.doesNotMatch(webSource,/const crits=Array\.isArray\(result\.log\)/)
 assert.match(reportSource,/heroTechnique/)
 assert.match(reportSource,/vitalPulse/)
 assert.match(reportSource,/shieldCritGuard/)
})
test('AB-01: falha/recarga não pode forçar relatório de vitória',()=>{
 assert.throws(()=>formatPvpBattleReport({ok:false,cooldown:true}),/inválido/)
 assert.throws(()=>formatPvpBattleReport({ok:true,winner:{}}),/inválido/)
})
