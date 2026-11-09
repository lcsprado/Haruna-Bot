import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {renderClanSiegePreview} from '../web/clan-siege-ui.js'

const source=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8')
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8')
function uiFor({rulesVersion=6,myTurn=false,nextTurns=[2,3],myMove=null}={}){
 const match={
   status:'active',rulesVersion,round:1,roundEndsAt:Date.now()+300000,
   blueClanId:'10',redClanId:'20',blueHp:2000,redHp:2000,blueMaxHp:2000,redMaxHp:2000,
   blueGate:2,redGate:2,blueSupplies:3,redSupplies:3,blueScore:0,redScore:0,
   blueRepairs:0,redRepairs:0,blueFortress:null,redFortress:null,mySide:'blue',myTurn,nextTurns,myMove,myTarget:null,
   submitted:0,history:[]
 }
 return {siege:{enabled:true,match,myClanId:'10',clans:[{id:'10',name:'Alpha',members:4,linked:4},
  {id:'20',name:'Rivais',members:4,linked:4}]},siegePreviewAction:'attack',siegePreviewTarget:'castle',siegeError:''}
}
test('V6 reserva: avisa rodizio e bloqueia confirmacao de ataque de jogador fora da vez',()=>{
 const html=renderClanSiegePreview(uiFor())
 assert.match(html,/Você está na reserva nesta rodada/)
 assert.match(html,/Próximos turnos: 2, 3/)
 assert.match(html,/Aguardando seu turno/)
 assert.doesNotMatch(html,/data-siege-command="move"/)
})
test('V6 combatente ativo: pode confirmar sua ação e vê orientação da própria vez',()=>{
 const html=renderClanSiegePreview(uiFor({myTurn:true,nextTurns:[1,4]}))
 assert.match(html,/Sua vez nesta rodada do Cerco V6/)
 assert.match(html,/data-siege-command="move"/)
 assert.match(html,/até seis jogadores por lado/)
})
test('V5 antigo ignora myTurn ausente e preserva ações e versão visual do Cerco',()=>{
 const html=renderClanSiegePreview(uiFor({rulesVersion:5,myTurn:false,nextTurns:[]}))
 assert.match(html,/GUERRA ATIVA · V5/)
 assert.match(html,/Dois clãs, quatro jogadores/)
 assert.match(html,/data-siege-command="move"/)
 assert.doesNotMatch(html,/Você está na reserva nesta rodada/)
})
test('V6 ação já registrada não pode ser reenviada nem em turno ativo',()=>{
 const html=renderClanSiegePreview(uiFor({myTurn:true,myMove:'attack'}))
 assert.match(html,/Ação registrada nesta rodada/)
 assert.doesNotMatch(html,/data-siege-command="move"/)
})
test('V6 não altera protocolo V5 enquanto a API não estiver atualizada',()=>{
 const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
 assert.match(app,/const WEB_BUILD_ID='alpha-siege-v5-20261108'/)
 assert.match(sw,/siege-v6-rotation-20261109/)
 assert.match(source,/rotationActive=active&&rulesVersion>=6/)
 assert.match(source,/const canMove=active&&Boolean\(match.mySide\)&&!match.myMove&&isMyTurn/)
})
