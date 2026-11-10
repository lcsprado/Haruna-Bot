import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {renderClanSiegePreview} from '../web/clan-siege-ui.js'

const makeUi=({rulesVersion=6,members=6,linked=6,myTurn=false,mySide='blue',submitted=1}={})=>({
 siege:{enabled:true,myClanId:'blue',clans:[
  {id:'blue',name:'Alpha',members,linked},
  {id:'red',name:'Rivais',members,linked}
 ],match:{
  id:'1',status:'active',rulesVersion,round:2,roundEndsAt:Date.now()+300_000,
  blueClanId:'blue',redClanId:'red',blueHp:2000,redHp:2000,blueMaxHp:2000,redMaxHp:2000,
  blueGate:2,redGate:2,blueSupplies:2,redSupplies:2,blueScore:0,redScore:0,
  blueRepairs:0,redRepairs:0,mySide,myTurn,nextTurns:[2,4],
  myMove:null,myTarget:null,submitted,activePerClan:2,history:[]
 }},siegePreviewAction:'attack',siegePreviewTarget:'castle',siegeError:''
})

test('AB-07: V6 exibe membros vinculados reais (2 a 6) sem confundir elenco com quatro vagas',()=>{
 for(const members of [2,3,4,5,6]){
  const html=renderClanSiegePreview(makeUi({members,linked:members}))
  assert.match(html,new RegExp(members+'/'+members+' Web vinculados'))
  assert.match(html,/1\/4 vagas ativas usadas \(2 por clã\)/)
  if(members>2)assert.doesNotMatch(html,/\d+\/2 Web vinculados/)
 }
})
test('AB-07: jogador reserva vê os próximos turnos e não pode confirmar',()=>{
 const html=renderClanSiegePreview(makeUi())
 assert.match(html,/Você está na reserva nesta rodada/)
 assert.match(html,/Próximos turnos: 2, 4/)
 assert.doesNotMatch(html,/data-siege-command="move"/)
})
test('AB-07: combatente da rodada ativa pode confirmar; espectador não recebe falsa indicação de reserva',()=>{
 const active=renderClanSiegePreview(makeUi({myTurn:true}))
 assert.match(active,/data-siege-command="move"/)
 const spectator=renderClanSiegePreview(makeUi({mySide:null}))
 assert.match(spectator,/Você não participa desta partida do Cerco V6/)
 assert.doesNotMatch(spectator,/data-siege-command="move"/)
})
test('AB-07: V5 mantém quatro ações, dois membros por clã e nenhuma rotação V6',()=>{
 const html=renderClanSiegePreview(makeUi({rulesVersion:5,members:2,linked:2}))
 assert.match(html,/2\/2 Web vinculados/)
 assert.match(html,/1\/4 ações enviadas/)
 assert.match(html,/data-siege-command="move"/)
 assert.doesNotMatch(html,/vagas ativas usadas/)
})
test('AB-07: PWA instalada atualiza cache sem alterar protocolo da API V5',()=>{
 const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8')
 const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
 assert.match(sw,/roster-slots-20261110/)
 assert.match(app,/WEB_BUILD_ID='alpha-siege-v5-20261108'/)
})

test('AB-07: PWA pré-guerra exibe versão V6 comunicada pelo servidor e preserva histórico V5',()=>{
 const ui=makeUi({rulesVersion:5,members:4,linked:4})
 ui.siege.match.status='completed'
 ui.siege.nextRulesVersion=6
 const html=renderClanSiegePreview(ui)
 assert.match(html,/CERCO · SÁBADO ÀS 21H30 · V6/)
 assert.match(html,/Dois clãs, de 2 a 6 jogadores por lado/)
 assert.match(html,/4\/4 Web vinculados/)
 assert.match(html,/Resultado anterior preservado na regra V5/)
 assert.doesNotMatch(html,/data-siege-command="move"/)
 delete ui.siege.nextRulesVersion
 const legacy=renderClanSiegePreview(ui)
 assert.match(legacy,/CERCO · SÁBADO ÀS 21H30 · V5/)
 assert.match(legacy,/Dois clãs, quatro jogadores/)
})
