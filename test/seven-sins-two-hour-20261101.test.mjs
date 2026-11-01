import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PECADOS_EDITIONS,PECADOS_BOSS_PHASES,PECADOS_ESSENCES_PER_PHASE,pecadosEditionCompletionBonus} from '../src/neon/sete-pecados-catalog.js';

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
const phaseHps=[180000,200000,220000,240000,250000,260000,270000,300000];
const current=PECADOS_EDITIONS.find(x=>x.key.endsWith('20261101'));

test('01/11: oito fases reais cabem na janela 18h–20h, sem aumentar a quantidade de essências',()=>{
  assert.ok(current);
  assert.equal(current.end-current.start,2*60*60*1000);
  assert.equal(PECADOS_BOSS_PHASES.length,8);
  assert.equal(phaseHps.reduce((sum,hp)=>sum+hp,0),1920000);
  assert.ok(phaseHps.every(hp=>hp>=160000));
  assert.equal(PECADOS_ESSENCES_PER_PHASE,2);
  assert.equal(pecadosEditionCompletionBonus(current.key),7);
  assert.match(games,/const PECADOS_0111_PHASE_HPS=Object\.freeze\(\[180000,200000,220000,240000,250000,260000,270000,300000\]\)/);
  assert.match(games,/editionKey===PECADOS_0111_KEY\?\{hp:PECADOS_0111_PHASE_HPS\[index\]\}/);
});
test('Primeira fase não reseta o dano/ranking nem duplica entrega ao aplicar reequilíbrio ao vivo',()=>{
  const live=games.slice(games.indexOf("if(s?.scheduleKey===edition.key){"),games.indexOf('// Recalcular somente a fase ATIVA'));
  assert.match(live,/edition\.key===PECADOS_0111_KEY&&s\.balanceVersion!==PECADOS_0111_BALANCE/);
  assert.match(live,/const dealt=Math\.max\(0,previousMax-previousHp\)/);
  assert.match(live,/const remaining=Math\.max\(1,target\.hp-dealt\)/);
  assert.match(live,/const adjusted=\{\.\.\.s,hp:remaining,maxHp:newMax,baseHp:target\.hp/);
  assert.match(live,/balanceVersion:PECADOS_0111_BALANCE/);
  assert.doesNotMatch(live,/participants:\{\}|ledger:\{\}|DELETE FROM/);
  const sample={hp:439440,maxHp:510000,participants:{a:{damage:30000},b:{damage:28000},c:{damage:12560}},ledger:{a:{phases:{}}}};
  const dealt=sample.maxHp-sample.hp;
  const next={...sample,hp:Math.max(1,180000-dealt),maxHp:180000,balanceVersion:'20261101-two-hour-fixed-hp-v1'};
  assert.equal(next.hp,109440);
  assert.equal(next.maxHp-next.hp,dealt);
  assert.deepEqual(next.participants,sample.participants);
  assert.deepEqual(next.ledger,sample.ledger);
});
test('Novos participantes não adicionam 35% HP em nenhuma fase 01/11',()=>{
  const section=games.slice(games.indexOf('// HP escala quando um NOVO participante causa seu primeiro ataque'),
    games.indexOf('const existingParticipant=s.participants[jid]||{}'));
  assert.match(section,/s\.scheduleKey!==PECADOS_0111_KEY/);
  assert.match(section,/s\.maxHp\+=hpIncrease/);
  assert.match(games,/edition\.key===PECADOS_0111_KEY\?\{balanceVersion:PECADOS_0111_BALANCE\}/);
});
test('Horários anunciados não contradizem janela real e placar permanece por fase',()=>{
  const announced=bot.slice(bot.indexOf('let setePecadosBusy=false'),
    bot.indexOf('let camEventBusy=false'));
  assert.match(announced,/1\.920\.000 HP fixos/);
  assert.match(announced,/Evento permanece até as 20h/);
  assert.doesNotMatch(announced,/5\.400\.000 HP/);
  const phase=bot.slice(bot.indexOf("const message='🌑⚔️ *PRÓXIMO PECADO"),
    bot.indexOf('for(const chat of groupIds){',bot.indexOf("const message='🌑⚔️ *PRÓXIMO PECADO")));
  assert.match(phase,/Evento até \*20h\*/);
  assert.doesNotMatch(phase,/20:40/);
  assert.match(games,/async function settlePecadoPhase\(c,s,chat\)/);
  assert.match(games,/PECADOS_ESSENCES_PER_PHASE/);
});
