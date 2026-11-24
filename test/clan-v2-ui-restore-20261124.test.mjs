import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClanSiegePreview} from '../web/clan-siege-ui.js';
import {clanProgress} from '../src/neon/clan-level-bonuses.js';

const fortress={
 clanId:'7',clanName:'Alpha',isLeader:true,clanLevel:10,treasury:12_000_000,
 levels:{hp:2,attack:3,defense:1},
 offers:{
  hp:{cost:1_000_000,durationMs:8*3600_000},
  attack:{cost:500_000,durationMs:4*3600_000},
  defense:{cost:500_000,durationMs:4*3600_000}
 },
 stats:{maxHp:2100,attackPct:.06,defensePct:.015},pending:null
};
const ui=(siege={})=>({
 siege:{enabled:false,nextRulesVersion:6,fortress,fortressUpgradesEnabled:true,...siege},
 extras:{clan:{id:'7',name:'Alpha',role:'leader',members:2},clans:[]},
 siegePreviewAction:'attack',siegePreviewTarget:'castle'
});
test('fora do cerco, fortaleza mantém três melhorias e percentuais reais',()=>{
 const html=renderClanSiegePreview(ui());
 for(const k of ['hp','attack','defense'])assert.match(html,new RegExp('data-siege-upgrade="'+k+'"'));
 for(const title of ['Muralhas','Arsenal','Defesas'])assert.ok(html.includes(title));
 assert.ok(html.includes('6.0%')&&html.includes('1.5%'));
 assert.ok(html.includes('2100'));
});
test('cerco ativo ou pre-cerco mantêm painel de melhorias apenas uma vez',()=>{
 const html=renderClanSiegePreview(ui({enabled:true,clans:[],myClanId:'7',match:null}));
 assert.equal(html.split('data-siege-upgrade="hp"').length-1,1);
});
test('sem dados da API, informa indisponibilidade sem inventar custo ou bonus',()=>{
 const html=renderClanSiegePreview(ui({fortress:null}));
 assert.match(html,/Melhorias da fortaleza indisponíveis/);
 assert.doesNotMatch(html,/data-siege-upgrade=/);
});
test('obras suspensas e membros sem liderança não conseguem investir',()=>{
 for(const siege of [{fortressUpgradesEnabled:false},{fortress:{...fortress,isLeader:false}}]){
  const html=renderClanSiegePreview(ui(siege));
  assert.match(html,/data-siege-upgrade="attack" disabled/);
 }
});
test('Web recebe apenas benefícios calculados e elegibilidade do servidor',()=>{
 const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
 const web=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 assert.match(api,/clanMemberParticipation\(db,jid\)/);
 assert.match(api,/clanBonus=clan\?/);
 assert.match(web,/renderClanBonusPanel\(ex.clanBonus\)/);
 assert.match(web,/member.eligible===true/);
 const progress=clanProgress(405000);
 assert.equal(progress.level,10);
 assert.deepEqual(progress.benefits,{level:10,xpPct:3.6,damagePct:2,defensePct:0.5});
});
