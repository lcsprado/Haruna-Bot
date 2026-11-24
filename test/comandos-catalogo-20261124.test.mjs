import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const index=read('src/neon/index.js')
const menus=index.match(/const commandPages=\{([\s\S]*?)\n\}\nconst commandsMenu=/)
assert.ok(menus,'Catálogo numerado !comandos deve existir')
const catalog=menus[1]
function page(n){
 const start=catalog.indexOf("'"+n+"':`")
 assert.ok(start>=0,'Página '+n+' inexistente')
 const end=Number(n)<9?catalog.indexOf("'"+(Number(n)+1)+"':`",start+4):catalog.length
 assert.ok(end>start,'Página '+n+' sem final')
 return catalog.slice(start,end)
}

test('nove páginas por número preservadas, cada uma abaixo do limite de 4096 caracteres',()=>{
 for(let i=1;i<=9;i++){
  const text=page(i)
  assert.ok(text.length<4096,'Página '+i+' excedeu 4096 caracteres: '+text.length)
  assert.match(text,/9️⃣ Voltar • 0️⃣ Fechar/)
 }
 assert.match(index,/setQuickFlow\(chat,sender,'commands_category'/)
 assert.match(index,/setQuickFlow\(chat,sender,'commands_main'/)
})

const cases={
  2:['!cltifood','!centralifood','!coletaifood','!bolsafamilia','!motos','!garagem'],
  3:['!picaretas','!comprarpicareta madeira','!repararpicareta madeira','Ouro','Diamante'],
  4:['!raid 50 go','!raid 50 go sempet','!raid 30 sempet','!entrar 30 sempet','!go 30 sempet','!desistir 30',
     '!raidlote 50 4h','!raidlote 50 8h','!raidlote 50 12h','!raidlote 50 8h sempet',
     '!raidlote confirmar','!raidlote status','!raidlote painel','!raidlote recibo','!raidlote cancelar','!raidlote historico'],
  5:['!bingov2','!bingo','!cartelav2','!cartela','!leilao','!leilaov2','!lancev2',
     '!corridas','!comprarcorrida','!equiparcorrida','!oficina','!corrida','!desafiocorrida',
     '!rankcorrida','!historicocorrida','!gttabela','!gtclima','!gtpatrocinio','!poco','!pocorank'],
  6:['!minerar','!minerar status','!minerar iniciar madeira','!minerar resgatar','!minerar cancelar'],
  7:['!rankdoacoes','!rankingdoacoes']
}
for(const [number,expected] of Object.entries(cases)){
 test('catálogo '+number+' contém os comandos implementados',()=>{
  for(const cmd of expected) assert.ok(page(number).includes(cmd),number+': falta '+cmd)
 })
}

test('duas entradas da central mostram novidades e a navegação',()=>{
 const heads=[
 index.slice(index.indexOf('async function showCommandsMainMenu('),index.indexOf('function textOf(msg)')),
 index.slice(index.indexOf('const commandsMenu=async()=>{'),index.indexOf('const commandCategory=async('))
 ]
 for(const head of heads){
  assert.match(head,/!minerar/)
  assert.match(head,/!raidlote/)
  assert.match(head,/!corridas/)
  assert.match(head,/!gt/)
  assert.match(head,/!bingo/)
  assert.match(head,/!leilao/)
  assert.match(head,/1️⃣/)
  assert.match(head,/9️⃣/)
 }
})

test('comandos novos existem em handlers reais, não são apenas texto',()=>{
 const mining=read('src/neon/torre-mineracao-whatsapp.js')
 const racing=read('src/neon/racing-commands.js')
 const gt=read('src/neon/gt-alpha-event.js')
 const v2=read('src/neon/reboot-events-whatsapp.js')
 const poco=read('src/neon/poco-abismo-live.js')
 for(const command of ['minerar','picaretas','comprarpicareta','repararpicareta'])assert.ok(mining.includes("'"+command+"'"))
 for(const command of ['corridas','oficina','rankcorrida','historicocorrida','desafiocorrida'])assert.ok(racing.includes("'"+command+"'"))
 for(const command of ['gttabela','gtpatrocinio','gtclima','gtpistas'])assert.ok(gt.includes("'"+command+"'"))
 for(const command of ['bingov2','cartelav2','leilaov2','lancev2'])assert.ok(v2.includes("'"+command+"'"))
 for(const command of ['poco','pocorank'])assert.ok(poco.includes("'"+command+"'"))
 assert.match(index,/if\(\['raidlote'\]\.includes\(cmd\)/)
 assert.match(index,/if\(miningRuntimeEnabled\(\)\&\&await handleMiningCommand/)
})

test('opções especiais da Raid de abertura rápida e pet seguem rotas oficiais',()=>{
 assert.match(index,/const quickStart=cmd==='raid'\&\&raidOptions.includes\('go'\)/)
 assert.match(index,/const usePet=!raidOptions.some/)
 assert.match(index,/!raid 50 go sempet/)
 assert.match(index,/!raidlote 50 8h sempet/)
 assert.match(index,/!cltifood 1/)
})
