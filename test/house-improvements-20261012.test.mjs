import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {homeTrainingReward,homeRestCapacity,homeRestDescription,homeCatalogText,homeBenefitsText} from '../src/neon/home-menu.js'

const source=readFileSync(new URL('../src/neon/progression.js',import.meta.url),'utf8')
const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const housesSource=source.slice(source.indexOf('export const HOUSES=['),source.indexOf('export const CARS=[')).replace(/^export /gm,'')
const HOUSES=new Function(housesSource+';return HOUSES')()
const expected=[
  ['kitnet',25000,100,.5,15,0,3],
  ['casa',80000,180,.75,25,0,5],
  ['sobrado',200000,300,1,35,1,7],
  ['mansao',600000,450,1.25,50,2,9],
  ['cobertura',1500000,650,1.5,70,3,12]
]

test('Cinco imóveis preservam preços, entrada de 60%, XP fixo e recuperação base',()=>{
  assert.equal(HOUSES.length,5)
  for(let i=0;i<expected.length;i++){
    const [id,price,fixed,pct,rest,reserves,sleep]=expected[i]
    const h=HOUSES[i]
    assert.equal(h.id,id)
    assert.equal(h.price,price)
    assert.equal(h.trainingXp,fixed)
    assert.equal(h.trainingPercent,pct)
    assert.equal(h.petRestPercent,rest)
    assert.equal(h.reserveRestSlots,reserves)
    assert.equal(h.sleepXpPercent,sleep)
    assert.ok(db.includes(id+':{label:'),'bônus de sono existente: '+id)
    assert.ok(db.includes('pct:'+sleep+',fee:0}'),'percentual de sono preservado: '+id)
  }
  assert.match(source,/Math.floor\(current.price\*\.60\)/)
})

test('Treino combina XP fixo + bônus do nível; sem nerf e sem efeito no level 999',()=>{
  for(const house of HOUSES){
    for(const level of [1,50,100,150,400,998]){
      const reward=homeTrainingReward(house,level)
      assert.equal(reward.base,house.trainingXp)
      assert.equal(reward.bonus,Math.floor(level*house.trainingPercent))
      assert.equal(reward.total,house.trainingXp+reward.bonus)
      assert.ok(reward.total>=house.trainingXp)
    }
    assert.equal(homeTrainingReward(house,999).total,0)
  }
  assert.equal(homeTrainingReward(HOUSES[4],150).total,875)
  assert.match(source,/if\(currentLevel>=999\)return \{ok:false,maxLevel:true,house\}/)
  assert.match(source,/ignoreXpBoost:true,ignoreGroupProgressionEvent:true/)
  assert.match(source,/HOME_ACTIVITY_COOLDOWN_SECONDS=24\*60\*60/)
})

test('Catálogo mostra benefícios ANTES da compra, cabe em uma mensagem WhatsApp',()=>{
  const menu=homeCatalogText(HOUSES)
  assert.ok(menu.length<4096)
  assert.match(menu,/R\$ 1\.500\.000/)
  assert.match(menu,/1,5%/)
  assert.match(menu,/70% HP\/energia/)
  assert.match(menu,/3 reservas/)
  assert.match(homeBenefitsText(HOUSES[4]),/12%/)
  assert.match(homeRestDescription(HOUSES[2]),/1 reserva/)
  assert.deepEqual(HOUSES.map(homeRestCapacity),[3,3,4,5,6])
  assert.equal(bot.split('homeCatalogText(HOUSES').length-1,3)
  assert.match(bot,/homeBenefitsText\(item\)/)
  assert.match(bot,/activity\.trainingReward\.total/)
  assert.match(bot,/p\.reserve\?' \(reserva\)'/)
})

test('Descanso mantém exclusão de expedicionários, evita duplicidades e prioriza necessidade',()=>{
  assert.match(source,/NOT EXISTS \(SELECT 1 FROM pet_team t WHERE t\.jid=p\.jid AND t\.pet_id=p\.id\)/)
  assert.match(source,/NOT EXISTS \(SELECT 1 FROM pet_expeditions e/)
  assert.match(source,/e\.resolved=FALSE/)
  assert.match(source,/p\.active=FALSE/)
  assert.match(source,/reserveCandidates\.sort\(\(a,b\)=>b\.need-a\.need/)
  assert.match(source,/reserveCandidates\.slice\(0,reserveLimit\)/)
  assert.match(source,/FOR UPDATE OF p/)
})

const restSource=source.slice(source.indexOf('export async function restTeamPetsAtHome(jid){'),source.indexOf('export async function buyHouse(jid,input){')).replace(/^export /gm,'')
const buildRest=(house,team,reserves,away=[],cooldownOk=true)=>{
  const writes=[]
  let cooldownCalls=0
  const api={
    async query(query,args){
      if(query.includes('FROM user_homes'))return {rows:[{house_id:house.id}]}
      if(query.includes('FROM pet_team t JOIN pet_collection'))return {rows:team}
      if(query.includes('FROM pet_collection p') && query.includes('NULL::integer'))return {rows:reserves}
      if(query.includes('SELECT pet_id FROM pet_expeditions'))return {rows:away.map(id=>({pet_id:id}))}
      if(query.includes('UPDATE pet_collection SET hp=')){writes.push({table:'collection',id:args[4]});return {rows:[]}}
      if(query.includes('UPDATE pets SET hp=')){writes.push({table:'pets'});return {rows:[]}}
      throw Error('Unrecognized query '+query.slice(0,140))
    }
  }
  const rest=new Function(
    'ensureUser','tx','homeFromId','homeRestCapacity','claimCooldown','petMaxHp','petMaxEnergy','homeActivityKey','HOME_ACTIVITY_COOLDOWN_SECONDS',
    restSource+';return restTeamPetsAtHome'
  )(
    async()=>{}, async fn=>fn(api), id=>HOUSES.find(h=>h.id===id),
    homeRestCapacity,async()=>{cooldownCalls++;return {ok:cooldownOk,remaining:3600}},
    ()=>100,()=>100,(jid,action)=>'house:'+action+':'+jid,86400
  )
  return {rest,writes,getCooldownCalls:()=>cooldownCalls}
}
const makePet=(id,hp,energy,slot=null)=>({
  id,name:'pet'+id,species:'cachorro',level:1,xp:0,hp,max_hp:100,
  energy,active:slot===1,slot
})

test('Descanso preserva trio e restaura 1/2/3 reservas por imóvel, sem duplicar',async()=>{
  const team=[makePet(1,50,50,1),makePet(2,50,50,2),makePet(3,50,50,3)]
  const reserves=[makePet(4,0,0),makePet(5,20,20),makePet(6,40,40),makePet(7,100,100)]
  for(let i=0;i<HOUSES.length;i++){
    const {rest,writes,getCooldownCalls}=buildRest(HOUSES[i],team,reserves)
    const result=await rest('user1')
    assert.equal(result.ok,true)
    assert.equal(result.restored.length,3+HOUSES[i].reserveRestSlots)
    assert.equal(result.restored.filter(x=>x.reserve).length,HOUSES[i].reserveRestSlots)
    assert.equal(writes.filter(x=>x.table==='collection').length,3+HOUSES[i].reserveRestSlots)
    assert.equal(writes.filter(x=>x.table==='pets').length,1)
    assert.equal(getCooldownCalls(),1)
  }
})

test('HP/energia completos não gastam descanso diário',async()=>{
  const full=[makePet(1,100,100,1),makePet(2,100,100,2),makePet(3,100,100,3)]
  const {rest,writes,getCooldownCalls}=buildRest(HOUSES[4],full,[makePet(4,100,100)])
  const result=await rest('user1')
  assert.equal(result.ok,false)
  assert.equal(result.full,true)
  assert.equal(getCooldownCalls(),0)
  assert.equal(writes.length,0)
})

test('Pet em expedição é ignorado; cooldown não faz mudanças parciais',async()=>{
  const team=[makePet(1,50,50,1),makePet(2,50,50,2),makePet(3,50,50,3)]
  const {rest,writes,getCooldownCalls}=buildRest(HOUSES[2],team,[],[2],false)
  const result=await rest('user1')
  assert.equal(result.ok,false)
  assert.equal(getCooldownCalls(),1)
  assert.equal(writes.length,0)
})
