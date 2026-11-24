import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// O motor é importado sem inicializar banco ou acessar dados de jogadores.
const source=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
const pure=source.replace(/^import .*;\s*$/gm,'');
const {resolveSiegeRound}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(pure));
const match=(changes={})=>({
  blue_clan_id:'10',red_clan_id:'20',
  blue_hp:2000,red_hp:2000,
  blue_repairs:0,red_repairs:0,blue_spy:0,red_spy:0,
  round:1,rules_version:2,...changes
});
const m=(clan_id,action)=>({clan_id,action});

test('partidas antigas mantêm dano, defesa, reparo e empate da regra v1',()=>{
  const r=resolveSiegeRound(match({rules_version:1}),[
    m('10','attack'),m('10','repair'),m('20','attack'),m('20','defend')
  ]);
  assert.equal(r.result.blueDamage,117);
  assert.equal(r.result.redDamage,180);
  assert.equal(r.hp.blue,1960);
  assert.equal(r.hp.red,1883);
  assert.equal(r.result.rulesVersion,undefined);
});

test('ataque em dupla concede 10% e defesa/contra-ataque mudam a vantagem',()=>{
  const rush=resolveSiegeRound(match(),[m('10','attack'),m('10','attack')]);
  assert.equal(rush.result.blueDamage,396);
  assert.equal(rush.result.blueTactic,'Assalto coordenado');
  const counter=resolveSiegeRound(match(),[
    m('10','attack'),m('10','defend'),m('20','attack'),m('20','attack')
  ]);
  assert.equal(counter.result.blueDamage,260); // 180 ataque + 80 resposta
  assert.equal(counter.result.blueCounter,80);
  assert.equal(counter.result.blueBlocked,198);
  assert.equal(counter.result.redDamage,198);
  assert.ok(counter.hp.blue>counter.hp.red);
  assert.equal(counter.result.blueTactic,'Avanço protegido');
});

test('dupla defesa bloqueia 75% e contra-ataca somente se foi atacada',()=>{
  const incoming=resolveSiegeRound(match(),[
    m('10','attack'),m('10','attack'),m('20','defend'),m('20','defend')
  ]);
  assert.equal(incoming.result.blueDamage,99);
  assert.equal(incoming.result.redDamage,160);
  assert.equal(incoming.result.redBlocked,297);
  assert.equal(incoming.result.redTactic,'Muralha conjunta');
  const peaceful=resolveSiegeRound(match(),[
    m('10','repair'),m('20','defend'),m('20','defend')
  ]);
  assert.equal(peaceful.result.redCounter,0);
  assert.equal(peaceful.result.redDamage,0);
});

test('reparo de 220 por uso salva castelo mas continua limitado a 2 na guerra',()=>{
  const used=resolveSiegeRound(match({blue_hp:1000,red_hp:1000}),[
    m('10','attack'),m('10','repair'),m('20','attack'),m('20','attack')
  ]);
  assert.equal(used.hp.blue,824);
  assert.equal(used.hp.red,820);
  assert.equal(used.repairs.blue,1);
  const noMore=resolveSiegeRound(match({blue_hp:1000,blue_repairs:2}),[
    m('10','repair'),m('10','repair')
  ]);
  assert.equal(noMore.hp.blue,1000);
  assert.equal(noMore.repairs.blue,2);
  assert.equal(resolveSiegeRound(match({blue_hp:1990}),[m('10','repair')]).hp.blue,2000);
});

test('espionagem coordena atacante na rodada e fortalece os próximos dois atacantes',()=>{
  const first=resolveSiegeRound(match(),[
    m('10','attack'),m('10','spy')
  ]);
  assert.equal(first.result.blueDamage,234);
  assert.equal(first.spy.blue,1);
  assert.equal(first.result.blueTactic,'Ataque marcado');
  const next=resolveSiegeRound(match({round:2,blue_spy:1,red_hp:first.hp.red}),[
    m('10','attack'),m('10','attack')
  ]);
  assert.equal(next.result.blueDamage,634);
  assert.equal(next.spy.blue,0);
  const double=resolveSiegeRound(match(),[m('10','spy'),m('10','spy')]);
  assert.equal(double.spy.blue,2);
  assert.equal(resolveSiegeRound(match({round:2,blue_spy:2}),[
    m('10','attack'),m('10','attack')
  ]).result.blueDamage,871);
});

test('HP decide vitória após sexta rodada; igualdade empata sem campeão',()=>{
  const tie=resolveSiegeRound(match({round:6,blue_hp:500,red_hp:500}),[]);
  assert.equal(tie.finished,true);
  assert.equal(tie.winner,null);
  const win=resolveSiegeRound(match({round:6,blue_hp:500,red_hp:450}),[]);
  assert.equal(win.winner,'10');
});
