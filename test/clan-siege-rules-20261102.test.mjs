import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Inspeciona o módulo de regras sem inicializar pg.Pool nem exigir DATABASE_URL no CI.
const source=readFileSync(new URL('../src/neon/clan-siege.js',import.meta.url),'utf8');
const pure=source.replace(/^import .*;\s*$/gm,'');
const {resolveSiegeRound,isClanSiegeEnabled,analyzeSiegeEligibility}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(pure));

function match(overrides={}){
  return {blue_clan_id:'1',red_clan_id:'2',blue_hp:2000,red_hp:2000,
    blue_repairs:0,red_repairs:0,blue_spy:0,red_spy:0,round:1,...overrides};
}
const move=(clan_id,action)=>({clan_id,action});

test('cerco: 180 de ataque, -35% com guarda, reparo de 140, efeitos simultâneos',()=>{
  const result=resolveSiegeRound(match(),[
    move('1','attack'),move('1','repair'),move('2','defend'),move('2','attack')
  ]);
  assert.equal(result.hp.blue,1960);
  assert.equal(result.hp.red,1883);
  assert.equal(result.repairs.blue,1);
  assert.equal(result.result.blueDamage,117);
  assert.equal(result.finished,false);
});

test('cerco: defesa dupla não ultrapassa 60%',()=>{
  const result=resolveSiegeRound(match(),[
    move('1','attack'),move('1','attack'),move('2','defend'),move('2','defend')
  ]);
  assert.equal(result.hp.red,1856);
});

test('cerco: espionagem concede +20% somente no round seguinte',()=>{
  const first=resolveSiegeRound(match(),[
    move('1','spy'),move('1','defend'),move('2','attack')
  ]);
  assert.equal(first.spy.blue,1);
  assert.equal(first.result.blueDamage,0);
  const second=resolveSiegeRound(match({round:2,blue_spy:1,red_hp:first.hp.red}),[
    move('1','attack')
  ]);
  assert.equal(second.result.blueDamage,216);
  assert.equal(second.spy.blue,0);
});

test('cerco: limita reparos acumulados e respeita 2.000 HP',()=>{
  const r=resolveSiegeRound(match({blue_hp:1000,blue_repairs:2}),[
    move('1','repair'),move('1','repair')
  ]);
  assert.equal(r.hp.blue,1000);
  assert.equal(r.repairs.blue,2);
  const capped=resolveSiegeRound(match({blue_hp:1990}),[move('1','repair')]);
  assert.equal(capped.hp.blue,2000);
});

test('cerco: encerra no round 6 e admite empate sem prêmio',()=>{
  const tie=resolveSiegeRound(match({round:6,blue_hp:400,red_hp:400}),[]);
  assert.equal(tie.finished,true);
  assert.equal(tie.winner,null);
  const win=resolveSiegeRound(match({round:6,blue_hp:500,red_hp:400}),[]);
  assert.equal(win.winner,'1');
});

test('cerco: exige chave e JID exato do grupo AlphaBot',()=>{
  const priorFlag=process.env.ALPHA_CLAN_SIEGE_ENABLED;
  const priorGroup=process.env.ALPHA_CLAN_SIEGE_GROUP_JID;
  try{
    process.env.ALPHA_CLAN_SIEGE_ENABLED='0';
    process.env.ALPHA_CLAN_SIEGE_GROUP_JID='120363012345678900@g.us';
    assert.equal(isClanSiegeEnabled(),false);
    process.env.ALPHA_CLAN_SIEGE_ENABLED='1';
    delete process.env.ALPHA_CLAN_SIEGE_GROUP_JID;
    assert.equal(isClanSiegeEnabled(),false);
    process.env.ALPHA_CLAN_SIEGE_GROUP_JID='outro-grupo';
    assert.equal(isClanSiegeEnabled(),false);
    process.env.ALPHA_CLAN_SIEGE_GROUP_JID='120363012345678900@g.us';
    assert.equal(isClanSiegeEnabled(),true);
  }finally{
    if(priorFlag===undefined)delete process.env.ALPHA_CLAN_SIEGE_ENABLED;
    else process.env.ALPHA_CLAN_SIEGE_ENABLED=priorFlag;
    if(priorGroup===undefined)delete process.env.ALPHA_CLAN_SIEGE_GROUP_JID;
    else process.env.ALPHA_CLAN_SIEGE_GROUP_JID=priorGroup;
  }
});

test('cerco: preflight exige 2 clãs com exatamente 2 jogadores vinculados e autorizados',()=>{
  const rows=[
    {id:1,name:'Alpha',members:2,linked:2,jids:['lp','augusto']},
    {id:2,name:'Rivais',members:2,linked:2,jids:['joao','kaique']}
  ];
  const good=analyzeSiegeEligibility(rows,new Set(['lp','augusto','joao','kaique']));
  assert.equal(good.ready,true);
  assert.equal(good.authorizedPlayers,4);
  assert.equal(good.linkedPlayers,4);
  assert.equal(Object.hasOwn(good.teams[0],'jids'),false);
  assert.equal(JSON.stringify(good).includes('"lp"'),false);
  const missing=analyzeSiegeEligibility(rows,new Set(['lp','joao','kaique']));
  assert.equal(missing.ready,false);
  assert.equal(missing.authorizedPlayers,3);
  const disconnected=analyzeSiegeEligibility([{...rows[0],linked:1},rows[1]],new Set(['lp','augusto','joao','kaique']));
  assert.equal(disconnected.ready,false);
  const extra=analyzeSiegeEligibility([...rows,{id:3,name:'Terceiro',members:2,linked:2,jids:['x','y']}],new Set(['lp','augusto','joao','kaique','x','y']));
  assert.equal(extra.ready,false);
});

test('cerco: novos convites manuais sao desativados; kickoff usa os quatro membros autorizados',()=>{
  const daily=source.split('export async function startDailyClanSiege(nowMs=now())')[1]?.split('async function openMatch(conn,chat,locked=false)')[0]||'';
  const challenge=source.split('export async function clanSiegeChallenge(session)')[1]?.split('export async function clanSiegeAccept(session)')[0]||'';
  const accept=source.split('export async function clanSiegeAccept(session)')[1]?.split('export async function clanSiegeMove(session,action)')[0]||'';
  assert.match(daily,/dailySiegeTeams\(conn\)/);
  assert.match(daily,/siegeBetaAuthorizedSet\(conn\)/);
  assert.match(daily,/pg_advisory_xact_lock/);
  assert.match(daily,/created_by=\$2 AND created_at>=\$3/);
  assert.match(challenge,/automaticamente às 20h/);
  assert.match(accept,/automaticamente às 20h/);
});
