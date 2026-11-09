import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const code=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8')
const sw=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8')
const exchangeBody=code.slice(code.indexOf('async function exchange(code){'),code.indexOf('async function sync(',code.indexOf('async function exchange(code){')))
assert.match(exchangeBody,/async function exchange\(code\)/)
const tokenKey='alphaWebTokenV1',pendingKey='alphaWebIdentitySwitchPendingV1'
const makeStorage=(data={})=>{
 const store=new Map(Object.entries(data))
 return {getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),store}
}
function exchangeFixture(request){
 const localStorage=makeStorage({[tokenKey]:'existing-person-token'})
 const ui={token:'existing-person-token',data:{profile:{push_name:'Old player'}},catalog:{old:true},extras:{old:true},avatarUrl:null,lastFullSyncAt:100,syncing:true}
 let wasAuthorized=null,stopped=0
 const ctx={ui,localStorage,TOKEN_KEY:tokenKey,SWITCH_PENDING_KEY:pendingKey,URL:{revokeObjectURL:()=>{}},
  stopRaidAuto:()=>stopped++,stopBossAuto:()=>stopped++,
  api:async(path,options)=>{assert.equal(path,'/api/v1/auth/exchange');assert.equal(ui.token,'','token antigo nao pode ir na requisicao');wasAuthorized=options;return request()}
 }
 const exchange=vm.runInNewContext(exchangeBody+'\nexchange',ctx)
 return {ui,localStorage,exchange,getStopped:()=>stopped,getOptions:()=>wasAuthorized}
}
test('código inválido preserva token antigo, mas bloqueia identidade automática',async()=>{
 const f=exchangeFixture(async()=>{throw Error('Código expirado')})
 await assert.rejects(f.exchange('ABCD1234'),/Código expirado/)
 assert.equal(f.localStorage.getItem(tokenKey),'existing-person-token')
 assert.equal(f.localStorage.getItem(pendingKey),'1')
 assert.equal(f.ui.token,'')
 assert.equal(f.getStopped(),0)
})
test('novo código válido só troca identidade após resposta do servidor',async()=>{
 const f=exchangeFixture(async()=>({token:'token-validado-da-nova-pessoa'}))
 const result=await f.exchange('abc-123')
 assert.equal(result.token,'token-validado-da-nova-pessoa')
 assert.equal(f.localStorage.getItem(tokenKey),'token-validado-da-nova-pessoa')
 assert.equal(f.localStorage.getItem(pendingKey),null)
 assert.equal(f.ui.data,null)
 assert.equal(f.ui.catalog,null)
 assert.equal(f.ui.extras,null)
 assert.equal(f.ui.token,'token-validado-da-nova-pessoa')
 assert.equal(f.getStopped(),2)
 assert.deepEqual(JSON.parse(f.getOptions().body),{code:'ABC123'})
})
test('resposta sem token válido preserva sessão anterior sem mostrar conta antiga',async()=>{
 const f=exchangeFixture(async()=>({ok:true,token:''}))
 await assert.rejects(f.exchange('ABC999'),/sessão válida/)
 assert.equal(f.localStorage.getItem(tokenKey),'existing-person-token')
 assert.equal(f.ui.token,'')
 assert.equal(f.localStorage.getItem(pendingKey),'1')
})
test('código vazio não inicia troca nem modifica sessão atual',async()=>{
 const f=exchangeFixture(async()=>{throw Error('should not request')})
 await assert.rejects(f.exchange('   '),/Informe o código/)
 assert.equal(f.ui.token,'existing-person-token')
 assert.equal(f.localStorage.getItem(tokenKey),'existing-person-token')
 assert.equal(f.localStorage.getItem(pendingKey),null)
})
test('boot com código falho não restaura automaticamente outra pessoa',()=>{
 const b=code.slice(code.indexOf('(async function boot(){'),code.lastIndexOf('})();'))
 assert.match(b,/if\(linked\)\{/)
 assert.doesNotMatch(b,/if\(ui\.token\)\{\s*history\.replaceState\(\{\},document\.title,'\/rpg'\);\s*showApp\(\)/)
 assert.match(b,/if\(localStorage\.getItem\(SWITCH_PENDING_KEY\)\)\{/)
 assert.match(b,/ui\.token='';\s*showLogin\('Há uma sessão anterior/)
 assert.match(b,/showLogin\(err\.message\+' Gere um novo !web ou escolha explicitamente/)
})
test('restauração exige botão de usuário, oculto quando não há token salvo',()=>{
 assert.match(html,/id="resumeSessionBtn" type="button" hidden/)
 assert.match(code,/\$\('#resumeSessionBtn'\)\.onclick=async\(\)=>/)
 assert.match(code,/previous\.hidden=!localStorage\.getItem\(TOKEN_KEY\)/)
 assert.match(code,/if\(ui\.token&&ui\.data\)\{\s*localStorage\.removeItem\(SWITCH_PENDING_KEY\)/)
})
test('resposta de sincronização antiga não altera a nova conta',async()=>{
 const syncBody=code.slice(code.indexOf('async function sync(silent,force=false){'),code.indexOf('// Lightweight HP/status delta:',code.indexOf('async function sync(silent,force=false){')))
 let release=()=>{}
 const pending=new Promise(resolve=>{release=resolve})
 const ui={token:'token-antigo',syncing:false,data:null,catalog:null,lastFullSyncAt:0}
 let showCount=0
 const ctx={ui,setSync:()=>{},api:async path=>path==='/api/v1/catalog'?{data:{a:1}}:pending,incomingRelationshipProposals:()=>[],syncAvatar:async()=>{},showApp:()=>{showCount++},render:()=>{},toast:()=>{},logout:()=>{}}
 const sync=vm.runInNewContext(syncBody+'\nsync',ctx)
 const running=sync(true,true)
 ui.token='token-da-nova-conta'
 release({data:{profile:{push_name:'Velho'} }})
 await running
 assert.equal(ui.data,null)
 assert.equal(ui.catalog,null)
 assert.equal(showCount,0)
 assert.equal(ui.syncing,false)
})
test('PWA troca a versão do cache offline sem alterar a versão obrigatória do Cerco',()=>{
 assert.match(sw,/auth-explicit-restore-20261109/)
 assert.match(code,/const WEB_BUILD_ID='alpha-siege-v5-20261108'/)
 assert.match(sw,/\'\/app\.js\'/)
})
