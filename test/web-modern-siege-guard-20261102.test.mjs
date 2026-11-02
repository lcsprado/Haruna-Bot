import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=path=>readFileSync(join(root,path),'utf8');
const app=read('web/app.js');
const siege=read('web/clan-siege-ui.js');
const garage=read('web/racing-ui.js');
const css=read('web/styles.css');
const sw=read('web/sw.js');
const html=read('web/index.html');
const cfg=JSON.parse(read('web/vercel.json'));

test('Web moderno: imagens Work, Sete Pecados, inventário e pets continuam',()=>{
  for(const token of ['COLLAB_ITEM_ART_SHEETS','CLASS_PORTRAITS','EVENT_ITEM_ART_SHEETS','COLLAB_PET_SPRITES','PET_TEAM_SLOT_LABELS','renderEvents']){
    assert.ok(app.includes(token),'Faltou visual moderno: '+token);
  }
  for(const path of [
    'web/assets/pecados-heroes.webp','web/assets/pecados-weapons.webp',
    'web/assets/pecados-armors.webp','web/assets/event-gear.webp',
    'web/assets/raid-weapons.webp','web/assets/raid-bosses-60-70.webp',
    'web/assets/classes-paladin-necromancer.webp'
  ])assert.ok(existsSync(join(root,path)),path);
  assert.doesNotMatch(app,/NPCs \/ Comerciantes|function renderNpcs\(/);
});

test('Garagem: manter fotos reais nos quatro modelos e nas doze pinturas',()=>{
  assert.match(garage,/race-car-photo/);
  assert.match(garage,/\/assets\/racing\//);
  assert.match(css,/\.race-car-photo/);
  const models=['gol','uno','corsa','palio'];
  const colors=['prata','branco','preto','cinza','vermelho','azul','verde','amarelo','laranja','roxo','rosa','dourado'];
  for(const model of models)for(const color of colors){
    const path=join(root,'web','assets','racing',model+'-'+color+'.webp');
    assert.ok(existsSync(path),'Arte do carro perdida: '+model+' '+color);
  }
});

test('Cerco: integridade do painel, API e da premiação',()=>{
  assert.match(app,/renderClanSiegePreview\(ui\)/);
  assert.match(app,/bindClanSiegePreview\(ui,\{render,submit:submitSiege,refresh:loadSiege\}\)/);
  assert.match(app,/api\/v1\/me\/clan-siege/);
  assert.match(siege,/renderLiveSiege/);
  assert.match(siege,/Insígnia dos Primeiros Conquistadores/);
  assert.match(css,/\.siege-preview/);
  assert.match(css,/\.siege-prize/);
  assert.ok(sw.includes("'/clan-siege-ui.js'"));
  assert.ok(html.includes('20261102-work-art-carphotos-siege-v1'));
  assert.ok(cfg.headers.some(x=>x.source==='/clan-siege-ui.js'));
});

test('Clã: exibe só integrantes reais, jamais todos os jogadores do grupo',()=>{
  const start=app.indexOf('function renderClan(){');
  const end=app.indexOf('function gameStatePanel(',start);
  assert.ok(start>0&&end>start);
  const source=app.slice(start,end);
  assert.match(source,/ex\.clanMembers/);
  assert.doesNotMatch(source,/roster\(\)/);
  const mock={
    data:{identity:{jid:'LP'}},
    extras:{clan:{id:5,name:'METEDORES DE PLANTÃO',role:'leader',members:2},
      clans:[{id:5,name:'METEDORES DE PLANTÃO',members:2},{id:7,name:'os entrosas',members:2}],
      clanMembers:[{jid:'LP',push_name:'LP',role:'leader'},{jid:'AUG',push_name:'Augusto',role:'member'}]}
  };
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const factory=new Function('ui','roster','esc','renderClanSummary','renderClanSiegePreview','renderClanList','resultPanel',source+';return renderClan');
  const render=factory(mock,()=>{throw new Error('Não consultar roster global');},esc,()=>'',()=>'<section>Cerco ao Castelo</section>',()=>'',()=> '');
  const output=render();
  assert.match(output,/Augusto/);
  assert.match(output,/Integrantes do meu clã/);
  assert.match(output,/Cerco ao Castelo/);
  assert.doesNotMatch(output,/João Pedro|Kaique Rodrigues|Convidar \/ administrar jogadores/);
  assert.match(output,/data-clan-kick="AUG"/);
  assert.doesNotMatch(output,/data-clan-kick="LP"/);
  assert.doesNotMatch(output,/data-clan-invite="AUG"/);
});
