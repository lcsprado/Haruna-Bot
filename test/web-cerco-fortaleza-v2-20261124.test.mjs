import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {renderClanSiegePreview} from '../web/clan-siege-ui.js'

const fortress=Object.freeze({
  clanId:'1',clanName:'Alpha',clanLevel:8,treasury:32000000,isLeader:true,
  levels:{hp:1,attack:2,defense:3},pending:null,
  stats:{maxHp:2050,attackPct:0.04,defensePct:0.045},
  offers:{
    hp:{cost:10000000,durationMs:8*3600000},
    attack:{cost:18000000,durationMs:12*3600000},
    defense:{cost:28000000,durationMs:18*3600000}
  }
})
function ui(enabled,props={}){
  return {
    siege:{enabled,fortress,fortressUpgradesEnabled:true,nextRulesVersion:6,
      ...(enabled?{clans:[],myClanId:'1',match:null}:{}),...props},
    extras:{clan:{id:'1',name:'Alpha',role:'leader',members:3},clans:[]},
    siegePreviewAction:null,siegePreviewTarget:null
  }
}
test('fora da partida exibe os três upgrades, nível e porcentagens reais da fortaleza',()=>{
  const html=renderClanSiegePreview(ui(false))
  assert.match(html,/Evolução permanente da fortaleza/)
  assert.match(html,/Nível do clã: 8/)
  assert.match(html,/HP: <b>2050<\/b>/)
  assert.match(html,/Bônus ATK: <b>\+4\.0%<\/b>/)
  assert.match(html,/Redução de dano: <b>4\.5%<\/b>/)
  for(const stat of ['hp','attack','defense']){
    assert.match(html,new RegExp('data-siege-upgrade="'+stat+'"'))
  }
  assert.match(html,/Benefício atual no Cerco: <b>\+50 HP<\/b>/)
  assert.match(html,/Benefício atual no Cerco: <b>\+4,0%<\/b>/)
  assert.match(html,/Benefício atual no Cerco: <b>−4,5%<\/b>/)
  assert.match(html,/R\$ 10\.000\.000/)
  assert.match(html,/R\$ 18\.000\.000/)
  assert.match(html,/R\$ 28\.000\.000/)
})
test('guerra ativa mantém UMA seção de fortaleza e mostra as frentes',()=>{
  const html=renderClanSiegePreview(ui(true))
  assert.equal(html.split('aria-label="Evolução permanente da fortaleza"').length-1,1)
  for(const front of ['castle','gate','depot'])assert.match(html,new RegExp('data-siege-target="'+front+'"'))
})
test('suspensão da API preserva informações e desabilita investimentos',()=>{
  const html=renderClanSiegePreview(ui(false,{fortressUpgradesEnabled:false}))
  assert.match(html,/Investimentos da fortaleza indisponíveis/)
  for(const stat of ['hp','attack','defense'])assert.match(html,new RegExp('data-siege-upgrade="'+stat+'" disabled'))
  assert.match(html,/4\.5%/)
})
test('campo ausente na API falha fechado e jamais permite investir',()=>{
  const html=renderClanSiegePreview(ui(false,{fortressUpgradesEnabled:undefined}))
  assert.match(html,/data-siege-upgrade="attack" disabled/)
})
test('apenas líder com tesouro e sem obra pode investir',()=>{
  const member=renderClanSiegePreview(ui(false,{fortress:{...fortress,isLeader:false}}))
  assert.match(member,/data-siege-upgrade="attack" disabled/)
  const poor=renderClanSiegePreview(ui(false,{fortress:{...fortress,treasury:0}}))
  assert.match(poor,/data-siege-upgrade="attack" disabled/)
  const building=renderClanSiegePreview(ui(false,{fortress:{...fortress,pending:{stat:'hp',to:2,readyAt:Date.now()+3600000}}}))
  assert.match(building,/Obra em andamento/)
  assert.match(building,/data-siege-upgrade="attack" disabled/)
})
test('API sem payload exibe erro, nunca inventa custos ou níveis',()=>{
  const html=renderClanSiegePreview(ui(false,{fortress:null}))
  assert.match(html,/Melhorias da fortaleza indisponíveis/)
  assert.doesNotMatch(html,/data-siege-upgrade=/)
  assert.doesNotMatch(html,/R\$ 5\.000\.000/)
})
test('pessoa sem clã não recebe opções de investimento',()=>{
  const state=ui(false,{fortress:null});state.extras.clan=null
  const html=renderClanSiegePreview(state)
  assert.doesNotMatch(html,/Evolução permanente da fortaleza/)
})
test('frontend e API exigem flag e pagamento transacional, sem reviver V1',()=>{
  const source=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8')
  assert.match(source,/fortressUpgradesEnabled===true/)
  assert.match(source,/fortressUpgradesEnabled!==true/)
  assert.match(source,/ui\.siegeBusy/)
  assert.match(source,/data-siege-upgrade/)
  assert.doesNotMatch(source,/NPCs \/ Comerciantes/)
})
