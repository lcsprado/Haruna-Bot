import test from 'node:test';
import assert from 'node:assert/strict';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';
import {readFileSync} from 'node:fs';
const base={enabled:true,myClanId:'5',isLeader:true,
  clans:[{id:'5',name:'METEDORES',members:2,linked:2},{id:'7',name:'Entrosas',members:2,linked:2}],
  match:{id:'4',status:'active',round:1,roundEndsAt:Date.now()+50000,blueClanId:'5',
    redClanId:'7',blueHp:2250,redHp:2000,blueMaxHp:2250,redMaxHp:2000,
    rulesVersion:3,mySide:'blue',myMove:null,submitted:0,history:[]},
  fortress:{isLeader:true,treasury:5202000,clanLevel:209,
    levels:{hp:0,attack:0,defense:0},
    stats:{maxHp:2000,attackPct:0,defensePct:0},
    offers:{hp:{cost:5000000,durationMs:4*3600000},
      attack:{cost:5000000,durationMs:4*3600000},
      defense:{cost:5000000,durationMs:4*3600000}},pending:null}
};
test('fortaleza: tela separada do herói, saldos verdadeiros e compra somente por líder',()=>{
  const html=renderClanSiegePreview({siege:base});
  assert.match(html,/Fortaleza do clã/);
  assert.match(html,/5\.202\.000/);
  assert.match(html,/Nível do clã: 209/);
  assert.match(html,/2\.250/);
  assert.match(html,/data-siege-upgrade="hp"/);
  assert.match(html,/Construir/);
  assert.match(html,/separadas dos personagens/);
});
test('fortaleza: não permite construir quando já há obra ou visitante não é líder',()=>{
  const pending={...base,fortress:{...base.fortress,pending:{stat:'hp',to:1,readyAt:Date.now()+1234567,cost:5000000}}};
  assert.match(renderClanSiegePreview({siege:pending}),/data-siege-upgrade="hp" disabled/);
  const member={...base,fortress:{...base.fortress,isLeader:false}};
  assert.match(renderClanSiegePreview({siege:member}),/Somente líder/);
});
test('garagem e artes Work continuam preservadas no cache',()=>{
  const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
  assert.match(sw,/garage-photo-fit-v6-siege-tactics-v2-fortress-v1/);
  assert.match(sw,/alpha-fixed-art.webp/);
  assert.match(sw,/alpha-item-weapons.webp/);
  assert.match(sw,/racing-ui.js/);
});
