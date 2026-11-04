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


test('V5 revela capacidade real de reparo e custo antes de confirmar',()=>{
 const html=renderClanSiegePreview(ui(5,'repair','castle'));
 assert.match(html,/280 HP/);
 assert.match(html,/recuperação máxima seria 280 HP/);
 assert.match(html,/Reparar não garante vitória/);
 assert.match(html,/Aviso estratégico antes da confirmação/);
 assert.match(html,/1\/2/);
 const old=renderClanSiegePreview(ui(4,'repair','castle'));
 assert.match(old,/até 220 HP/);
 assert.doesNotMatch(old,/pode recuperar até 280 HP/);
});
test('V5 alerta se não há suprimento, há 2 reparos ou portão intacto',()=>{
 const missing=ui(5,'repair');
 missing.siege.match.blueSupplies=0;
 assert.match(renderClanSiegePreview(missing),/Sem suprimentos agora/);
 assert.match(renderClanSiegePreview(missing),/Reabastecer nesta rodada/);
 const noMore=ui(5,'repair');
 noMore.siege.match.blueRepairs=2;
 const html=renderClanSiegePreview(noMore);
 assert.match(html,/já usou os 2 reparos/);
 assert.doesNotMatch(html,/data-siege-command="move"/);
 const gateFull=ui(5,'repair','gate');
 gateFull.siege.match.blueGate=2;
 assert.match(renderClanSiegePreview(gateFull),/Portão intacto/);
});
test('V5 orienta espionagem final e não desperdiçar suprimento cheio',()=>{
 const spy=ui(5,'spy','gate');
 spy.siege.match.round=6;
 assert.match(renderClanSiegePreview(spy),/Última rodada/);
 assert.match(renderClanSiegePreview(spy),/não haverá próxima rodada/);
 const full=ui(5,'supply','depot');
 full.siege.match.blueSupplies=3;
 assert.match(renderClanSiegePreview(full),/Estoque já cheio/);
});
test('após uma partida antiga concluída, prévia é V5 mas resultado histórico permanece',()=>{
 const old=ui(1);
 old.siege.match.status='completed';
 old.siege.match.myMove=null;
 const html=renderClanSiegePreview(old);
 assert.match(html,/Resultado anterior preservado na regra V1/);
 assert.match(html,/próxima guerra usará V5/);
 assert.match(html,/data-siege-preview="supply"/);
 assert.match(html,/V5/);
 assert.doesNotMatch(html,/data-siege-command="move"/);
});
test('o histórico V5 diferencia dano e HP recuperado de fato',()=>{
 const x=ui(5);
 x.siege.match.history=[{round:2,rulesVersion:5,blueHp:1500,redHp:1400,
 blueDamage:180,redDamage:220,blueTactic:'Suporte',redTactic:'Ofensiva',
 blueHeal:280,redHeal:0}];
 const html=renderClanSiegePreview(x);
 assert.match(html,/HP realmente recuperado/);
 assert.match(html,/🔵 \+280/);
});
test('confirmação no Web mostra custo e riscos específicos de reparo e espião',()=>{
 const src=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8');
 assert.match(src,/REPARAR não garante vitória/);
 assert.match(src,/não poderá ser alterada/);
 assert.match(src,/Espionar na última rodada/);
});


test('V5 exibe motivo no histórico quando reparo ficou sem efeito',()=>{
 const x=ui(5);
 x.siege.match.history=[{round:2,rulesVersion:5,blueHp:1800,redHp:1750,
   blueDamage:180,redDamage:0,blueTactic:'🔨 Castelo',
   redTactic:'⚔️ Castelo',blueHeal:0,redHeal:0,
   blueRepairWithoutEffect:['sem suprimentos nesta rodada'],redRepairWithoutEffect:[]}];
 const html=renderClanSiegePreview(x);
 assert.match(html,/Reparos sem efeito/);
 assert.match(html,/sem suprimentos nesta rodada/);
});

test('guerra histórica V1 não trava escolhas da nova V5 nem fixa Defesa',()=>{
 const old=ui(1);
 old.siege.match.status='completed';
 old.siege.match.myMove='defend'; // estado residual da última partida
 old.siege.match.blueHp=740;old.siege.match.redHp=700;
 old.siege.match.history=[{round:6,blueHp:740,redHp:700,rulesVersion:1}];
 old.siegePreviewAction=null;
 const html=renderClanSiegePreview(old);
 for(const id of ['attack','defend','repair','spy','supply'])
   assert.match(html,new RegExp('data-siege-preview="'+id+'"'));
 assert.match(html,/data-siege-preview="supply"/);
 assert.match(html,/data-siege-target="castle"/);
 assert.match(html,/CERCO V5/);
 assert.match(html,/2000 \/ 2.000/);
 assert.match(html,/ÚLTIMA GUERRA — REGRA V1 \(HISTÓRICO\)/);
 assert.doesNotMatch(html,/siege-action selected" data-siege-preview="defend"/);
 assert.doesNotMatch(html,/data-siege-command="move"/);
 assert.doesNotMatch(html,/Insígnia dos Primeiros Conquistadores/);
});
test('na prévia de hoje V5 Defender não é obrigatório e pode escolher outro alvo',()=>{
 const m=ui(1,'defend','castle');m.siege.match.status='completed';m.siege.match.myMove=null;
 const defend=renderClanSiegePreview(m);
 assert.match(defend,/siege-action selected" data-siege-preview="defend"/);
 m.siegePreviewAction='spy';m.siegePreviewTarget='gate';
 const spy=renderClanSiegePreview(m);
 assert.match(spy,/siege-action selected" data-siege-preview="spy"/);
 assert.match(spy,/data-siege-target="gate"/);
 assert.doesNotMatch(spy,/siege-action selected" data-siege-preview="defend"/);
 const src=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8');
 assert.match(src,/status==='active'\?Number\(ui\.siege\.match\.rulesVersion\|\|1\):5/);
});
