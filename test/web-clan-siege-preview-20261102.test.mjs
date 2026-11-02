import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';

const eligible={
  clan:{id:10,name:'Guardas da Lua',members:2,role:'member'},
  clans:[
    {id:10,name:'Guardas da Lua',members:2},
    {id:11,name:'Os Entrosas',members:2}
  ]
};

test('cerco: renderiza os dois clãs reais sem começar batalha',()=>{
  const html=renderClanSiegePreview({extras:eligible});
  assert.match(html,/Guardas da Lua/);
  assert.match(html,/Os Entrosas/);
  assert.match(html,/2.000 \/ 2.000/);
  assert.match(html,/PRÉVIA · NÃO INICIADO/);
  assert.match(html,/não foi enviada nem salva/);
  assert.equal((html.match(/data-siege-preview=/g)||[]).length,4);
});

test('cerco: seleção visual altera apenas a descrição, não o servidor',()=>{
  const html=renderClanSiegePreview({extras:eligible,siegePreviewAction:'attack'});
  assert.match(html,/data-siege-preview="attack" aria-pressed="true"/);
  assert.match(html,/Estratégia em prévia/);
  assert.doesNotMatch(html,/data-action="clan\.siege/);
});

test('cerco: participantes não confirmados não devem aparecer como partida pronta',()=>{
  const html=renderClanSiegePreview({extras:{clan:{id:10,name:'Guardas',members:1},clans:[{id:10,name:'Guardas',members:1}]}});
  assert.match(html,/Aguardando a confirmação dos dois clãs/);
  assert.match(html,/não há ações de guerra habilitadas/i);
});

test('cerco: nomes recebidos da API são escapados',()=>{
  const html=renderClanSiegePreview({extras:{
    clan:{id:1,name:'<script>alert(1)</script>',members:2},
    clans:[{id:1,name:'<script>alert(1)</script>',members:2},{id:2,name:'Os Entrosas',members:2}]
  }});
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
});

test('cerco: módulo web não envia comandos, dinheiro ou estado de jogo',()=>{
  const code=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8');
  assert.doesNotMatch(code,/\bfetch\s*\(/);
  assert.doesNotMatch(code,/\bdoAction\s*\(/);
  assert.doesNotMatch(code,/localStorage\./);
  const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
  assert.match(app,/renderClanSiegePreview\(ui\)/);
  assert.match(app,/bindClanSiegePreview\(ui,\{render,submit:submitSiege,refresh:loadSiege\}\)/);
});
