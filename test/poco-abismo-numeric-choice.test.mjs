import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {POCO_SEASON} from '../src/neon/poco-abismo-rules.js'
import {POCO_LIVE_PLAYER_PREFIX} from '../src/neon/poco-abismo-settlement.js'
import {pocoNumericMode,pocoNumericMatchesPlayer,pocoNumericRoute} from '../src/neon/poco-abismo-numeric-choice.js'

const group='120363000000000001@g.us',other='120363000000000002@g.us',jid='player@s.whatsapp.net'
const state=()=>({season:POCO_SEASON.id,chat:group,active:{status:'active',floor:5,boss:{floor:5,hp:2050}}})
function dbWith(value){
 const calls=[]
 return {calls,query:async(sql,params)=>{calls.push({sql,params});return {rows:value?[{value}]:[]}}}
}

test('sem Poço ativo, números continuam disponíveis aos outros menus',async()=>{
 for(const value of [undefined,{...state(),active:null},{...state(),chat:other},
   {...state(),active:{status:'completed',boss:{floor:5}}},{...state(),season:'outra_temporada'}]){
  const db=dbWith(value)
  assert.equal(await pocoNumericRoute({db,sender:jid,chat:group,body:'1',
   env:{POCO_BETA_GROUP_PREVIEW:'true'}}),null)
 }
 assert.equal(pocoNumericMatchesPlayer(state(),group),true)
 assert.equal(pocoNumericMatchesPlayer(state(),other),false)
})

test('1-4 funcionam só para dono da tentativa, dentro do chat original',async()=>{
 for(const number of ['1','2','3','4']){
  const db=dbWith(state())
  assert.equal(await pocoNumericRoute({db,sender:jid,chat:group,body:number,
   env:{POCO_ABISMO_LIVE:'true'}}),'live')
  assert.equal(db.calls.length,1)
  assert.match(db.calls[0].sql,/SELECT value FROM trevo_settings WHERE key=\$1/)
  assert.deepEqual(db.calls[0].params,[POCO_LIVE_PLAYER_PREFIX+jid])
 }
 for(const body of ['5','0','11','1 2','!poco 1','!poço 1','1️⃣','hello']){
  const db=dbWith(state())
  assert.equal(await pocoNumericRoute({db,sender:jid,chat:group,body,
   env:{POCO_ABISMO_LIVE:'true'}}),null)
  assert.equal(db.calls.length,0,body)
 }
})

test('piloto beta consulta somente ledger de prévia; sem flag não intercepta',async()=>{
 const db=dbWith(state())
 assert.equal(pocoNumericMode({POCO_BETA_GROUP_PREVIEW:'true',POCO_ABISMO_LIVE:'true'}),'beta')
 assert.equal(pocoNumericMode({POCO_ABISMO_LIVE:'true',POCO_ABISMO_PREVIEW:'true'}),'preview')
 assert.equal(pocoNumericMode({}),null)
 assert.equal(await pocoNumericRoute({db,sender:jid,chat:group,body:'3',env:{POCO_BETA_GROUP_PREVIEW:'true'}}),'beta')
 assert.deepEqual(db.calls[0].params,['poco_abismo_preview_20261116:player:'+jid])
 const off=dbWith(state())
 assert.equal(await pocoNumericRoute({db:off,sender:jid,chat:group,body:'2',env:{}}),null)
 assert.equal(off.calls.length,0)
})

test('Poço ativo precede menus antigos e quiz; fora dele menus continuam normais',()=>{
 const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 const route=source.indexOf('const route=await pocoNumericRoute({db,sender,chat,body})')
 const quiz=source.indexOf('if(shouldRouteQuizContinuation(',route)
 const missingMenu=source.indexOf('Não encontrei um menu ativo para essa escolha',route)
 assert.ok(route>0&&quiz>route&&missingMenu>quiz)
 assert.match(source,/if\(!body\.startsWith\(prefix\)&&\/\^\[1-4\]\$\/\.test\(body\)\)\{/)
 const menu=source.indexOf('const activeNumericMenu=!body.startsWith(prefix)',route)
 assert.ok(menu>route&&quiz>menu,'Poço ativo precede recuperação de menus antigos')
 assert.match(source,/const betaAllowed=route==='beta'/)
 assert.match(source,/pocoBetaGroupAllowed\(\{chat,subject:betaMeta\?\.subject\}\)/)
 assert.match(source,/route==='live'\s*\? await handlePocoLiveCommand\(params\) : await handlePocoCommand\(params\)/)
})

test('mensagem do Poço informa escolha simples sem abandonar !poco 1',()=>{
 for(const path of ['poco-abismo-preview.js','poco-abismo-live.js']){
  const source=readFileSync(new URL('../src/neon/'+path,import.meta.url),'utf8')
  assert.match(source,/só com \*1, 2, 3 ou 4\*/)
  assert.match(source,/\*!poco 1\*/)
 }
})
