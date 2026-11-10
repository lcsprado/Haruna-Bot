import test from 'node:test';
import assert from 'node:assert/strict';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';

const extras={clan:{id:5,name:'Clã A',members:2},clans:[
  {id:5,name:'Clã A',members:2},{id:7,name:'Clã B',members:2}
]};
test('sessao nao vinculada mostra aviso e todas as frentes da V5 sem registrar jogada',()=>{
  const html=renderClanSiegePreview({
    extras,
    siege:{enabled:false,nextRulesVersion:5,reason:'Vincule o Web ao grupo AlphaBot pelo !web.'},
    siegePreviewAction:'attack',siegePreviewTarget:'gate'
  });
  assert.match(html,/Vincule o Web ao grupo/);
  assert.match(html,/!web/);
  assert.match(html,/PRÉVIA V5/);
  for(const action of ['attack','defend','repair','spy','supply'])
    assert.match(html,new RegExp('data-siege-preview="'+action+'"'));
  for(const target of ['castle','gate','depot'])
    assert.match(html,new RegExp('data-siege-target="'+target+'"'));
  assert.match(html,/data-siege-target="gate" aria-pressed="true"/);
  assert.doesNotMatch(html,/data-siege-command="move"/);
});
test('reabastecer só escolhe depósito e reparar só castelo ou portão',()=>{
  const supply=renderClanSiegePreview({extras,siege:{enabled:false},siegePreviewAction:'supply'});
  assert.match(supply,/data-siege-target="depot"/);
  assert.doesNotMatch(supply,/data-siege-target="castle"/);
  const repair=renderClanSiegePreview({extras,siege:{enabled:false},siegePreviewAction:'repair'});
  assert.match(repair,/data-siege-target="castle"/);
  assert.match(repair,/data-siege-target="gate"/);
  assert.doesNotMatch(repair,/data-siege-target="depot"/);
});
