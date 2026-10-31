import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {renderRacing} from '../web/racing-ui.js'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const carNames=['Gol Quadrado','Uno Mille','Corsa Wind','Palio Fire']
const catalog={
  cars:carNames.map((name,i)=>({id:['gol','uno','corsa','palio'][i],name,price:150000,stats:{speed:54,accel:54,grip:53,brake:53}})),
  parts:['motor','cambio','pneus','suspensao','freios','turbo'].map(id=>({id,benefit:{speed:7,accel:2}})),
  levels:Array.from({length:7},(_,i)=>({level:i+1,price:15000*(i+1),seconds:600*(i+1)})),
  tracks:[{id:'cidade',name:'Circuito Urbano'},{id:'reta',name:'Reta Alpha'}],
  strategies:[{id:'equilibrada',name:'Equilibrada'},{id:'agressiva',name:'Agressiva'}],
  tiers:[{id:'rua',name:'Rua',prize:3000,minTuning:0,minDriver:1}],
  totalUpgradeCost:25530000
}
const ui={racingTab:'garage',racingTier:'rua',racingTrack:'cidade',racingStrategy:'equilibrada',racingTarget:'',
  data:{identity:{jid:'user@s.whatsapp.net',groupLinked:false}},racing:{garage:{cars:[],profile:{xp:0,wins:0,races:0,spent:0}},catalog,ranking:[],history:[],challenges:[]}}
test('beta keeps Events while making Garagem Alpha the second menu option',()=>{
  const app=read('web/app.js')
  const home=app.indexOf("['home','⌂','Início']")
  const race=app.indexOf("['racing','🏎️','Garagem Alpha']")
  const events=app.indexOf("['events','🎉','Eventos']")
  assert.ok(home>=0&&race>home&&race<events)
  assert.match(app,/events:renderEvents/)
  assert.match(app,/racing:\(\)=>renderRacing\(ui\)/)
  assert.match(app,/racing-home-link/)
  assert.match(app,/if\(page==='racing'\)jobs\.push\(loadRacing\(false\)\)/)
  assert.match(app,/bindRacing\(ui/)
})
test('four illustrated cars render in responsive beta garage without external image downloads',()=>{
  const html=renderRacing(ui)
  carNames.forEach(name=>assert.ok(html.includes(name)))
  assert.ok((html.match(/class="race-car-svg"/g)||[]).length>=5)
  assert.match(html,/data-race-act="buy"/)
  assert.ok(!html.includes('<img'))
})
test('workshop respects active installation, six upgrade types and paid progression',()=>{
  const working={...ui,racingTab:'workshop',racing:{...ui.racing,garage:{...ui.racing.garage,cars:[{id:7,model_id:'gol',equipped:true,condition:90,upgrades:{motor:1},pending_part:'turbo',pending_level:2,pending_until:Math.floor(Date.now()/1000)+300}]}}}
  const html=renderRacing(working)
  assert.match(html,/Motor/)
  assert.match(html,/Turbo/)
  assert.match(html,/data-race-act="upgrade"/)
  assert.match(html,/disabled/)
  assert.match(html,/25\.680\.000/)
})
test('racing fetches only on page activation and actions, PWA invalidates old beta cache',()=>{
 const app=read('web/app.js'),sw=read('web/sw.js'),html=read('web/index.html')
 assert.match(app,/api\('\/api\/v1\/me\/racing'\)/)
 assert.match(app,/async function racingAction/)
 assert.match(app,/updateRacingClocks\(\)/)
 assert.match(html,/20261031-racing-beta-v1/)
 assert.match(sw,/alpha-rpg-pwa-20261031-racing-beta-v1/)
 assert.match(sw,/\/racing-ui\.js/)
 assert.match(sw,/Promise\.allSettled\(SHELL\.filter/)
 assert.match(read('web/styles.css'),/GARAGEM ALPHA/)
 assert.match(read('web/vercel.json'),/racing-ui\.js/)
})
