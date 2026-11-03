import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';

const clans=[
  {id:'10',name:'Metedores de Plantão',members:2,linked:2},
  {id:'20',name:'Os Entrosas',members:2,linked:2}
];
const view=(rulesVersion,round=1,history=[],side='blue')=>renderClanSiegePreview({
  siege:{enabled:true,myClanId:'10',clans,match:{
    id:'999',status:'active',round,rounds:6,roundEndsAt:Date.now()+100000,
    blueClanId:'10',redClanId:'20',rulesVersion,
    blueHp:1280,redHp:1280,blueRepairs:1,redRepairs:0,
    mySide:side,myMove:null,submitted:0,history
  }},siegePreviewAction:'attack'
});

test('v2 orienta o jogo de dupla com números e regra de vitória',()=>{
  const html=view(2);
  for (const text of [
    'Estratégia em conjunto', '396 de dano', '50% de proteção',
    '220 HP', '234 de dano', '75%', 'Inteligência total',
    'reparos restantes', 'Após 6 rodadas', 'HP igual dá empate'
  ]) assert.match(html,new RegExp(text,'i'));
  assert.match(html,/1\/2/);
  assert.match(html,/data-siege-command="move"/);
});

test('v2 mostra que espionagem na última rodada não serve',()=>{
  assert.match(view(2,6),/Na última rodada Espionar não gera bônus/);
});

test('uma guerra já iniciada com a regra antiga não anuncia bônus novos',()=>{
  const html=view(1);
  assert.match(html,/Guerra na regra antiga/);
  assert.match(html,/reparo 140/);
  assert.doesNotMatch(html,/Assalto coordenado/);
});

test('histórico só revela as combinações depois da rodada encerrada',()=>{
  const html=view(2,3,[{
    round:2,blueHp:1400,redHp:1100,blueDamage:260,redDamage:198,
    rulesVersion:2,blueTactic:'Avanço protegido',redTactic:'Assalto coordenado'
  }]);
  assert.match(html,/Avanço protegido/);
  assert.match(html,/Assalto coordenado/);
  assert.match(html,/260/);
});

test('preserva artes atuais do Work e imagens da garagem e muda versão de cache',()=>{
  const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
  assert.match(sw,/siege-tactics-v2/);
  assert.match(sw,/alpha-fixed-art.webp/);
  assert.match(sw,/alpha-item-weapons.webp/);
  assert.match(sw,/racing/);
});
