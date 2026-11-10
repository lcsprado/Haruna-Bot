import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {renderClanSiegePreview} from '../web/clan-siege-ui.js'

const six=(a=6,b=6)=>({enabled:false,nextRulesVersion:6,reason:'Aguardando vínculo individual.',
 preflight:{ready:true,teams:[
  {id:5,name:'Alpha',members:a,linked:a,betaAuthorized:a},
  {id:7,name:'Rivais',members:b,linked:b,betaAuthorized:b}
 ]}})
const extras={clan:{id:5,name:'Alpha'},clans:[]}

test('AB-07: fallback sem sessão ativa reconhece preflight do servidor V6 até 6×6, sem enviar ações',()=>{
 for(const [a,b] of [[2,6],[3,5],[6,6]]){
  const html=renderClanSiegePreview({extras,siege:six(a,b),siegePreviewAction:'attack',siegePreviewTarget:'gate'})
  assert.match(html,/PRÉVIA V6/)
  assert.match(html,/com 2 a 6 jogadores por clã/)
  assert.match(html,/O servidor confirmou dois clãs com todos os jogadores vinculados/)
  assert.match(html,/Aguardando vínculo individual/)
  assert.match(html,/data-siege-target="gate" aria-pressed="true"/)
  assert.doesNotMatch(html,/data-siege-command="move"/)
  assert.doesNotMatch(html,/GUERRA ADIADA/)
  assert.doesNotMatch(html,/Uma guerra 2 × 2/)
 }
})
test('AB-07: quando API não confirma versão, não afirmar falsamente V5 nem adiar a guerra',()=>{
 const html=renderClanSiegePreview({extras,siege:{enabled:false,reason:'API fora do ar'},siegePreviewAction:'spy'})
 assert.match(html,/VERSÃO A CONFIRMAR/)
 assert.match(html,/PRÉVIA VERSÃO A CONFIRMAR/)
 assert.match(html,/API fora do ar/)
 assert.doesNotMatch(html,/V5 · GUERRA ADIADA/)
 assert.doesNotMatch(html,/data-siege-command="move"/)
})
test('AB-07: fallback V5 antigo preserva 2×2 e botões apenas demonstrativos',()=>{
 const html=renderClanSiegePreview({extras,siege:{enabled:false,nextRulesVersion:5},siegePreviewAction:'repair'})
 assert.match(html,/Uma guerra 2 × 2/)
 assert.match(html,/PRÉVIA V5/)
 assert.doesNotMatch(html,/data-siege-command="move"/)
})
test('AB-07: PWA instalada recebe cache renovado após correção dos rótulos',()=>{
 const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8')
 assert.match(sw,/siege-v6-fallback-20261110/)
})
