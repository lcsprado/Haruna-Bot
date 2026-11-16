import test from 'node:test';
import assert from 'node:assert/strict';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';

const fortress={
  clanId:'1',clanName:'Alpha',isLeader:true,clanLevel:7,treasury:20000000,
  levels:{hp:1,attack:0,defense:0},
  offers:{
    hp:{cost:10000000,durationMs:8*3600000},
    attack:{cost:5000000,durationMs:4*3600000},
    defense:{cost:5000000,durationMs:4*3600000}
  },
  stats:{maxHp:2050,attackPct:0,defensePct:0},
  pending:null
};
const setup=(enabled,additional={})=>({
  siege:{enabled,nextRulesVersion:6,fortress,fortressUpgradesEnabled:true,...additional},
  extras:{clan:{id:'1',name:'Alpha',members:3,role:'leader'},clans:[]},
  siegePreviewAction:null,siegePreviewTarget:null
});

test('fora do Cerco, líder continua vendo e podendo comprar upgrades permanentes',()=>{
  const html=renderClanSiegePreview(setup(false));
  assert.match(html,/Evolução permanente da fortaleza/);
  for(const stat of ['hp','attack','defense'])
    assert.match(html,new RegExp('data-siege-upgrade="'+stat+'"'));
  assert.match(html,/Muralhas/);
  assert.match(html,/Arsenal/);
  assert.match(html,/Defesas/);
  assert.doesNotMatch(html,/NPCs \/ Comerciantes/);
});

test('Cerco V6 habilitado mantém painel da fortaleza',()=>{
  const html=renderClanSiegePreview(setup(true,{clans:[],myClanId:'1',match:null}));
  assert.match(html,/V6/);
  assert.match(html,/data-siege-upgrade="hp"/);
  for(const front of ['castle','gate','depot'])
    assert.match(html,new RegExp('data-siege-target="'+front+'"'));
});

test('servidor com obras suspensas mantém níveis visíveis sem permitir investimentos',()=>{
  const html=renderClanSiegePreview(setup(false,{fortressUpgradesEnabled:false}));
  assert.match(html,/Obras temporariamente suspensas/);
  assert.match(html,/data-siege-upgrade="hp" disabled/);
});

test('falha da API não esconde o painel silenciosamente nem simula preço',()=>{
  const html=renderClanSiegePreview(setup(false,{fortress:null}));
  assert.match(html,/Melhorias da fortaleza indisponíveis/);
  assert.doesNotMatch(html,/data-siege-upgrade=/);
});
