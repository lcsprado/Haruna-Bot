import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';
const match=(version=4)=>({
  id:'17',status:'active',round:3,roundEndsAt:Date.now()+240000,
  blueClanId:'5',redClanId:'7',blueHp:1640,redHp:1730,
  blueMaxHp:2050,redMaxHp:2000,blueRepairs:1,redRepairs:0,
  blueGate:1,redGate:0,blueSupplies:2,redSupplies:0,
  blueScore:4,redScore:2,rulesVersion:version,
  mySide:'blue',myMove:null,myTarget:null,submitted:0,history:[]
});
const fortress={isLeader:true,treasury:5202000,clanLevel:209,
  levels:{hp:0,attack:0,defense:0},
  stats:{maxHp:2000,attackPct:0,defensePct:0},
  offers:{hp:{cost:5000000,durationMs:4*3600000},
    attack:{cost:5000000,durationMs:4*3600000},
    defense:{cost:5000000,durationMs:4*3600000}},pending:null};
const ui=(version=4,choice='attack',target='castle')=>({
  siege:{enabled:true,myClanId:'5',isLeader:true,
    clans:[{id:'5',name:'Metedores de Plantão',members:2,linked:2},
      {id:'7',name:'Os Entrosas',members:2,linked:2}],
    match:match(version),fortress},
  siegePreviewAction:choice,siegePreviewTarget:target
});
test('v4 exibe três frentes, portão, suprimentos, objetivos e ações',()=>{
  const html=renderClanSiegePreview(ui());
  for(const value of ['GUERRA POR OBJETIVOS','data-siege-preview="supply"',
    'data-siege-target="castle"','data-siege-target="gate"',
    'data-siege-target="depot"','Portão','Depósito','🎯',
    '1/2','2/3','pontos','v4','Reabastecer']){
    assert.ok(html.toLowerCase().includes(value.toLowerCase()),value);
  }
});
test('reparo permite apenas castelo/portão e suprimento só depósito',()=>{
  const repairing=renderClanSiegePreview(ui(4,'repair','gate'));
  assert.match(repairing,/data-siege-target="gate"/);
  assert.doesNotMatch(repairing,/data-siege-target="depot"/);
  const supplying=renderClanSiegePreview(ui(4,'supply','depot'));
  assert.match(supplying,/data-siege-target="depot"/);
  assert.doesNotMatch(supplying,/data-siege-target="gate"/);
});
test('partida antiga V3 conserva quatro ações sem selecionar objetivos',()=>{
  const html=renderClanSiegePreview(ui(3));
  assert.doesNotMatch(html,/data-siege-target/);
  assert.doesNotMatch(html,/data-siege-preview="supply"/);
  assert.match(html,/Ataque marcado/);
});
test('alvo secreto só é exibido ao próprio jogador após confirmar',()=>{
  const state=ui();
  state.siege.match.myMove='attack';
  state.siege.match.myTarget='gate';
  const html=renderClanSiegePreview(state);
  assert.match(html,/Ação confirmada/);
  assert.match(html,/Objetivo escolhido/);
  assert.match(html,/data-siege-target="gate"/);
  assert.match(html,/data-siege-target="gate"[^>]*disabled/);
});
test('formulário mantém evento de seleção, validação e envio do alvo',()=>{
  const src=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8');
  assert.match(src,/data-siege-target/);
  assert.match(src,/ui\.siegePreviewTarget=target/);
  assert.match(src,/\{action:ui\.siegePreviewAction,target\}/); // confirmação envia ação e alvo
});
test('assets do Work, PWA e garagem não são substituídos',()=>{
  const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
  assert.match(sw,/fronts-v4/);
  assert.match(sw,/alpha-fixed-art.webp/);
  assert.match(sw,/alpha-item-weapons.webp/);
  assert.match(sw,/racing-ui.js/);
});
