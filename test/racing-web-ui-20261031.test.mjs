import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {renderRacing} from '../web/racing-ui.js'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const catalog={
 cars:[
  {id:'gol',name:'Gol Quadrado',price:150000,stats:{speed:54,accel:54,grip:53,brake:53}},
  {id:'uno',name:'Uno Mille',price:150000,stats:{speed:47,accel:65,grip:58,brake:48}},
  {id:'corsa',name:'Corsa Wind',price:150000,stats:{speed:50,accel:49,grip:65,brake:62}},
  {id:'palio',name:'Palio Fire',price:150000,stats:{speed:66,accel:48,grip:47,brake:50}}
 ],
 parts:[{id:'motor',name:'Motor',benefit:{speed:7,accel:2}},{id:'cambio',benefit:{accel:7,speed:1}},
  {id:'pneus',benefit:{grip:8}},{id:'suspensao',benefit:{grip:6,brake:2}},{id:'freios',benefit:{brake:8}},{id:'turbo',benefit:{speed:5,accel:5}}],
 levels:Array.from({length:7},(_,i)=>({level:i+1,price:15000*(i+1),seconds:600*(i+1)})),
 tracks:[{id:'cidade',name:'🌆 Circuito Urbano'},{id:'reta',name:'🛣️ Reta Alpha'},{id:'serra',name:'⛰️ Serra Fantasma'}],
 tiers:[{id:'rua',name:'Rua',prize:3000,minTuning:0,minDriver:1},{id:'bairro',name:'Bairro',prize:4500,minTuning:6,minDriver:4}],
 strategies:[{id:'equilibrada',name:'⚖️ Equilibrada'},{id:'agressiva',name:'🔥 Agressiva'},{id:'tecnica',name:'🎯 Técnica'}],
 totalUpgradeCost:25530000
}
catalog.colors=['prata','branco','preto','cinza','vermelho','azul','verde','amarelo','laranja','roxo','rosa','dourado'].map((id,i)=>({id,name:id,hex:['#BFC4CC','#F3F4F6','#242A34','#777E8A','#D8333F','#2979D6','#3EAD6A','#E8BD32','#EF8732','#8650C9','#E888B7','#CBA63A'][i]}))
const base={racing:{garage:{profile:{xp:220,races:3,wins:2,spent:150000},cars:[]},catalog,ranking:[],history:[],challenges:[]},racingTab:'garage',racingTrack:'cidade',racingTier:'rua',racingStrategy:'equilibrada',racingTarget:'',data:{identity:{jid:'user@g.us',groupLinked:true},group:{roster:[]}}}
test('renders four distinct locally hosted car photos',()=>{
 const html=renderRacing(base)
 assert.ok(html.includes('Gol Quadrado')&&html.includes('Uno Mille')&&html.includes('Corsa Wind')&&html.includes('Palio Fire'))
 assert.ok((html.match(/class="race-car-photo"/g)||[]).length>=5)
 assert.match(html,/\/assets\/racing\/gol-prata\.webp/)
 assert.ok(!html.includes('https://images'))
 assert.match(html,/data-race-act="buy"/)
})
test('mobile workshop has six paid parts and blocks upgrades with pending install',()=>{
 const ui={...base,racingTab:'workshop',racing:{...base.racing,garage:{...base.racing.garage,cars:[{
  id:1,model_id:'gol',equipped:true,condition:79,upgrades:{motor:2},pending_part:'pneus',pending_level:1,pending_until:Date.now()/1000+120
 }]}}}
 const html=renderRacing(ui)
 assert.match(html,/Motor/)
 assert.match(html,/Turbo/)
 assert.match(html,/Instalando/)
 assert.ok((html.match(/data-race-act="upgrade"/g)||[]).length===6)
 assert.match(html,/disabled/)
 assert.match(html,/25\.680\.000/)
 assert.equal((html.match(/class="race-part-image"/g)||[]).length,6)
 assert.match(html,/race-part-gains/)
})

test('paint preview uses all 12 stored colors while race actions remain available',()=>{
 const car={id:1,model_id:'gol',color_id:'prata',equipped:true,condition:90,upgrades:{}}
 const state={...base,racingTab:'paint',racingPaintCarId:1,racingPreviewColor:'azul',racing:{...base.racing,garage:{...base.racing.garage,cars:[car]}}}
 const html=renderRacing(state)
 assert.equal((html.match(/data-race-color=/g)||[]).length,12)
 assert.match(html,/Prévia antes de salvar/)
 assert.match(html,/data-race-act="paint"/)
 assert.match(html,/#2979D6/)
 assert.match(html,/\/assets\/racing\/gol-azul\.webp/)
 assert.match(html,/data-race-tab="races"/)
})
test('races use only available server-backed tiers, tracks and strategies',()=>{
 const ui={...base,racingTab:'races',racing:{...base.racing,garage:{...base.racing.garage,cars:[{
  id:1,model_id:'corsa',equipped:true,condition:100,upgrades:{},pending_part:null
 }]}}}
 const html=renderRacing(ui)
 assert.match(html,/Circuito Urbano/)
 assert.match(html,/Serra Fantasma/)
 assert.match(html,/MODO|Modo carreira/)
 assert.match(html,/data-race-act="solo"/)
 assert.match(html,/data-race-choice="tier"/)
 assert.match(html,/data-race-choice="strategy"/)
})
test('the race page requests one endpoint only on navigation, not every 15s',()=>{
 const app=read('web/app.js')
 assert.match(app,/import \{renderRacing,bindRacing,updateRacingClocks\} from '.\/racing-ui\.js'/)
 assert.match(app,/if\(ui\.page==='racing'\) await loadRacing\(false\)/)
 assert.match(app,/api\('\/api\/v1\/me\/racing'\)/)
 assert.match(app,/ui\.racingAmbientSyncAt/)
 assert.match(app,/120000/)
 assert.match(app,/updateRacingClocks\(\)/)
 assert.match(app,/racing:\(\)=>renderRacing\(ui\)/)
 assert.match(app,/data-page/)
 assert.ok(app.indexOf("['racing','🏎️','Garagem Alpha']")<app.indexOf("['pets','🐾','Pets']"))
 assert.match(app,/home-racing-link/)
 assert.match(read('web/styles.css'),/#nav\{display:flex;flex:1 1 auto;min-height:0;overflow-y:auto/)
 assert.match(read('web/sw.js'),/Promise\.allSettled\(SHELL\.filter/)
 assert.match(read('web/sw.js'),/racing-ui\.js/)
 assert.match(read('web/index.html'),/20261101-racing-visual-v2/)
})
