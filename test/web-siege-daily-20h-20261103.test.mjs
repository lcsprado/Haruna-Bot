import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';

const clans=[
  {id:'5',name:'Metedores',members:2,linked:2},
  {id:'7',name:'Entrosas',members:2,linked:2}
];
const base={
  enabled:true,myClanId:'5',isLeader:true,clans
};

test('Cerco automatico: nao oferece desafiar/aceitar quando parado',()=>{
 const html=renderClanSiegePreview({siege:{...base,match:null},siegePreviewAction:null});
 assert.match(html,/CERCO · SÁBADO ÀS 21H30/);
 assert.match(html,/A guerra acontece somente aos sábados, às 21h30 de Brasília/);
 assert.doesNotMatch(html,/V5 HOJE/);
 assert.doesNotMatch(html,/diariamente às 21h/);
 assert.doesNotMatch(html,/QUARTA ÀS 21H/);
 assert.doesNotMatch(html,/CERCO ÀS 20H/);
 assert.match(html,/Sábado 21h30/);
 assert.doesNotMatch(html,/data-siege-command="challenge"/);
 assert.doesNotMatch(html,/data-siege-command="accept"/);
 assert.doesNotMatch(html,/data-siege-command="move"/);
 assert.doesNotMatch(html,/siege-action selected/);
 assert.match(html,/Prévia sem registro/);
 assert.match(html,/Nenhuma ação selecionada/);
});

test('Cerco automatico: partida ativa exige confirmacao de cada acao',()=>{
 const html=renderClanSiegePreview({siege:{...base,match:{
   id:'3',status:'active',round:1,roundEndsAt:Date.now()+300000,
   blueClanId:'5',redClanId:'7',mySide:'blue',myMove:null,submitted:0,
   blueHp:2000,redHp:2000,history:[]
 }},siegePreviewAction:'attack'});
 assert.match(html,/GUERRA ATIVA/);
 assert.match(html,/data-siege-command="move"/);
 assert.match(html,/Só a confirmação registra sua ação/);
 assert.doesNotMatch(html,/data-siege-command="challenge"/);
});

test('Cerco automatico: desafio anterior ainda pode ser cancelado sem aceite no novo painel',()=>{
 const html=renderClanSiegePreview({siege:{...base,match:{
   status:'pending',redClanId:'7',blueClanId:'5',createdByMe:true,history:[],
   blueHp:2000,redHp:2000
 }},siegePreviewAction:'defend'});
 assert.match(html,/DESAFIO ANTIGO PENDENTE/);
 assert.match(html,/data-siege-command="cancel"/);
 assert.doesNotMatch(html,/data-siege-command="accept"/);
 assert.match(html,/expira em 30 minutos/);
});

test('Cerco automatico: preserva artwork Work e garagem, muda somente tela do Cerco',()=>{
 const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 assert.match(sw,/20261103-garage-photo-fit-v6/);
 assert.match(sw,/alpha-fixed-art.webp/);
 assert.match(sw,/alpha-item-weapons.webp/);
 assert.match(app,/racing/);
 assert.match(html,/app\.js\?v=2026\d{4}-[\w-]+/);
});
