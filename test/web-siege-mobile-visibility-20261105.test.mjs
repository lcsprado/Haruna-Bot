import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';

const src=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
const state=(rulesVersion,status='active')=>({
 siege:{enabled:true,myClanId:'5',clans:[{id:'5',name:'Clã azul',members:2},{id:'7',name:'Clã vermelho',members:2}],
 match:{id:'1',status,rulesVersion,round:1,roundEndsAt:Date.now()+60000,
 blueClanId:'5',redClanId:'7',blueHp:2000,redHp:2000,mySide:'blue',myMove:null,submitted:0}},
 siegePreviewAction:null,siegePreviewTarget:null
});
test('na V5 as cinco ações e três objetivos aparecem para qualquer combatente',()=>{
 const h=renderClanSiegePreview(state(5));
 for(const a of ['attack','defend','repair','spy','supply'])assert.match(h,new RegExp('data-siege-preview="'+a+'"'));
 for(const target of ['castle','gate','depot'])assert.match(h,new RegExp('data-siege-target="'+target+'"'));
 assert.match(h,/Para atacar ou defender o Portão/);
 assert.match(h,/siege-choices-grid/);
});
test('selecionar ação no celular mostra as frentes sem pressupor a Defesa',()=>{
 assert.match(src,/getElementById\('siege-target-options'\)\?\.scrollIntoView/);
 const h=renderClanSiegePreview(state(5));
 assert.match(h,/id="siege-target-options"/);
 assert.match(h,/data-siege-target="gate"[^>]*disabled/);
 assert.doesNotMatch(h,/siege-action selected" data-siege-preview="defend"/);
});
test('menu compacto no celular e novo cache sem afetar equipamentos',()=>{
 assert.match(css,/max-width:600px/);
 assert.match(css,/siege-choices-grid \.siege-action small\{display:none\}/);
 assert.match(html,/styles\.css\?v=20261105-siege-controls-v1/);
 assert.match(sw,/siege-controls-v1/);
 assert.match(sw,/alpha-item-weapons\.webp/);
});
test('partida antiga mantém regras antigas, mas prévia da próxima usa V5',()=>{
 const active=renderClanSiegePreview(state(3));
 assert.doesNotMatch(active,/data-siege-target="gate"/);
 assert.doesNotMatch(active,/data-siege-preview="supply"/);
 const history=renderClanSiegePreview(state(1,'completed'));
 assert.match(history,/data-siege-target="gate"/);
 assert.match(history,/data-siege-preview="supply"/);
});
