import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';

const teams=[{id:'5',name:'Metedores',members:2,linked:2},{id:'7',name:'Entrosas',members:2,linked:2}];
const state=(match=null)=>({enabled:true,myClanId:'5',isLeader:true,clans:teams,match});

test('Cerco pendente permite pré-visualizar as 4 ações, sem enviá-las',()=>{
  const html=renderClanSiegePreview({siege:state({
    id:'2',status:'pending',blueClanId:'5',redClanId:'7',blueHp:2000,redHp:2000,
    createdByMe:true,history:[]
  }),siegePreviewAction:null});
  for(const action of ['attack','defend','repair','spy']){
    assert.match(html,new RegExp('data-siege-preview="'+action+'"'));
    assert.doesNotMatch(html,new RegExp('data-siege-preview="'+action+'" disabled'));
  }
  assert.match(html,/PRÉVIA — NÃO ENVIADA/);
  assert.match(html,/Nenhuma ação selecionada/);
  assert.doesNotMatch(html,/data-siege-command="move"/);
  assert.doesNotMatch(html,/siege-action selected/);
});

test('Cerco pendente deixa mudar de Defender para Atacar e exibe a seleção',()=>{
  const html=renderClanSiegePreview({siege:state({
    status:'pending',blueClanId:'5',redClanId:'7',blueHp:2000,redHp:2000,
    history:[]
  }),siegePreviewAction:'attack'});
  assert.match(html,/data-siege-preview="attack"/);
  assert.match(html,/siege-action selected" data-siege-preview="attack"/);
  assert.match(html,/<strong>Atacar<\/strong>/);
  assert.doesNotMatch(html,/data-siege-command="move"/);
});

test('Cerco ativo exige seleção, depois libera confirmação de qualquer uma das quatro ações',()=>{
  const active={id:'10',status:'active',round:1,roundEndsAt:Date.now()+300000,
    blueClanId:'5',redClanId:'7',blueHp:2000,redHp:2000,mySide:'blue',
    myMove:null,submitted:0,history:[]};
  const blank=renderClanSiegePreview({siege:state(active),siegePreviewAction:null});
  assert.doesNotMatch(blank,/data-siege-command="move"/);
  assert.match(blank,/Selecione uma das quatro estratégias acima/);
  for(const action of ['attack','defend','repair','spy']){
    const selected=renderClanSiegePreview({siege:state(active),siegePreviewAction:action});
    assert.match(selected,new RegExp('data-siege-preview="'+action+'"'));
    assert.match(selected,/data-siege-command="move"/);
  }
});

test('Cerco impede trocar ação depois de confirmada',()=>{
  const active={id:'10',status:'active',round:2,roundEndsAt:Date.now()+300000,
    blueClanId:'5',redClanId:'7',blueHp:1600,redHp:1400,mySide:'blue',
    myMove:'repair',submitted:2,history:[]};
  const html=renderClanSiegePreview({siege:state(active),siegePreviewAction:'attack'});
  assert.match(html,/✅ Ação registrada nesta rodada/);
  assert.match(html,/<strong>Reparar<\/strong>/);
  assert.doesNotMatch(html,/data-siege-command="move"/);
  assert.match(html,/data-siege-preview="attack" disabled/);
});

test('Troca de rodada limpa seleção, e envio não tem Defender de fallback',()=>{
  const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
  const siege=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8');
  assert.match(app,/siegePreviewAction: null/);
  assert.match(app,/previous\?\.round!==current\.round/);
  assert.match(app,/ui\.siegePreviewAction=null;/);
  assert.doesNotMatch(siege,/ui\.siegePreviewAction\|\|'defend'/);
  assert.match(siege,/if\(command==='move'&&!ACTIONS\.some/);
});
