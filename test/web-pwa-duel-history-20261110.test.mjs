import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8')
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8')
const start=app.indexOf('function renderPvpDuelOpening(')
const end=app.indexOf('function resultPanel(',start)
assert.ok(start>=0&&end>start,'PWA rendering block missing')
const block=app.slice(start,end)
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
const num=x=>Number(x||0).toLocaleString('pt-BR')
const money=x=>'R$ '+num(x)
const resultMetric=(a,b)=>'<div data-metric="'+esc(a)+'">'+esc(b)+'</div>'
const {renderCombatResult}=new Function('esc','num','money','resultMetric',block+'\nreturn {renderCombatResult}')(esc,num,money,resultMetric)

function duel(){
 const a={jid:'player-a',name:'Primeiro',heroId:'pecado_ban',heroMasteryStage:5,
  hp:6000,maxHp:7000,atk:1220,def:910,crit:.90,petName:'Fênix Alpha',
  vitalHpRate:.08,vitalPulseRate:.05,shieldName:'Escudo Rúnico',shieldCritResist:.1044}
 const b={jid:'player-b',name:'Segundo',heroId:'pecado_diane',heroMasteryStage:4,
  hp:6400,maxHp:8100,atk:1020,def:1210,crit:.40}
 const log=[]
 for(let round=1;round<=20;round++){
  log.push({round,from:'Primeiro',to:'Segundo',dmg:300,actualDamage:round===20?100:300,
   hp:6100-round*300,crit:round%3===0,heroTechnique:round===6?'Snatch':undefined})
  log.push({round,from:'Segundo',to:'Primeiro',dmg:120,actualDamage:120,
   hp:5900-round*120,defenseTechnique:round===5?'Gideon':undefined,defenseBlocked:round===5?120:0})
 }
 log.push({round:8,petHeal:true,vitalPulse:true,from:'Primeiro',heal:350,hp:4500})
 log.push({round:9,classHeal:true,from:'Segundo',heal:150,hp:4300})
 log.push({round:10,from:'Segundo',to:'Primeiro',dodged:true,dmg:0,actualDamage:0,hp:3600})
 return {ok:true,opening:{attacker:a,defender:b},log,roundCount:20,decidedByLimit:true,
  winner:{jid:'player-a',name:'Primeiro',hp:3600},loser:{jid:'player-b',name:'Segundo',hp:300},reward:2000}
}
test('AB-01 PWA: exibe todos os 20 rounds e 43 eventos em vez de cortar os últimos oito',()=>{
 const d=duel(),html=renderCombatResult(d)
 assert.equal((html.match(/class="combat-hit /g)||[]).length,d.log.length)
 for(let round=1;round<=20;round++)assert.match(html,new RegExp('Rodada '+round+'(?:\\D|$)'))
 assert.doesNotMatch(block,/\.slice\(-8\)/)
 assert.match(html,/Histórico completo do duelo/)
 assert.match(html,/tabindex="0"/)
 assert.match(html,/Vitória por HP após limite/)
})
test('AB-01 PWA: escudo, herói, maestria, Vital, dano efetivo e golpes excedentes',()=>{
 const html=renderCombatResult(duel())
 for(const x of ['Snatch','Gideon','Coração Eterno','Escudo Rúnico','HP Vital','Maestria 5/5','dano efetivo','golpe 300','CRÍTICO','Cura de Segundo']){
  assert.ok(html.includes(x),'Ausente do resultado: '+x)
 }
 assert.match(html,/data-metric="Dano efetivo"/)
})
test('AB-01 PWA: escape XSS de nomes e técnicas, sem HTML enviado por jogadores',()=>{
 const d=duel()
 d.log[0].from='<img src=x onerror=alert(1)>'
 d.log[5].heroTechnique='<svg/onload=alert(1)>'
 d.opening.attacker.name='<script>hello</script>'
 const h=renderCombatResult(d)
 assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'))
 assert.ok(h.includes('&lt;svg/onload=alert(1)&gt;'))
 assert.ok(h.includes('&lt;script&gt;hello&lt;/script&gt;'))
 assert.ok(!h.includes('<svg/onload=alert(1)>'))
 assert.ok(!h.includes('<script>hello</script>'))
})
test('AB-01 PWA: duelo de pets mantém sua apresentação anterior sem mutação de resultado',()=>{
 const d={winner:{species:'fenix_alpha',name:'Fênix',level:80,hp:90,max_hp:200},
  loser:{species:'lobo',name:'Lobo'},rounds:6}
 const original=JSON.stringify(d)
 const h=renderCombatResult(d)
 assert.match(h,/VENCEDOR PET/)
 assert.match(h,/RODADAS/)
 assert.equal(JSON.stringify(d),original)
})
test('AB-01 PWA: Service Worker renova app e CSS e estilos mantêm scroll acessível',()=>{
 assert.match(sw,/pvp-full-history-20261110/)
 assert.match(sw,/'\/app\.js'/)
 assert.match(sw,/'\/styles\.css'/)
 assert.match(css,/\.combat-result \.combat-log\{max-height:360px/)
 assert.match(css,/\.combat-fighters-opening/)
})
