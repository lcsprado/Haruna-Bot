import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {MAX_PET_AUTO_POTIONS_PER_DAY} from '../src/neon/pet-potion-auto-policy.js'
import {autoHealRaidEntryCombatPet} from '../src/neon/raid-entry-pet-heal.js'

function fixture({hp=0,energy=0,stock=3,used=0}={}){
  let remaining=stock,heals=0,audits=0,debits=0
  const player={jid:'raid-test',name:'Jogador',pet:{name:'Dragão',hp,energy,maxHp:2600},petPotionHealing:0,petPotionUses:0}
  const client={async query(sql,args=[]){
    if(sql.includes('SELECT item_id,quantity FROM inventories'))return {rows:remaining>0?[{item_id:'pocao_pet_full',quantity:remaining}]:[]}
    if(sql.includes('SELECT COUNT(*)'))return {rows:[{used}]}
    if(sql.includes('UPDATE inventories SET quantity=quantity-1')){
      if(remaining<=0) return {rowCount:0,rows:[]}
      remaining--;debits++;return {rowCount:1,rows:[{quantity:remaining}]}
    }
    if(sql.includes('INSERT INTO transactions')){audits++;return {rowCount:1,rows:[]}}
    throw Error('Unexpected query: '+sql)
  }}
  const choosePotion=(rows)=>rows[0]?{...rows[0],heal:Number.MAX_SAFE_INTEGER,name:'Poção Full de Pet'}:null
  const persistPet=async()=>{heals++}
  return {player,remaining:()=>remaining,heals:()=>heals,audits:()=>audits,debits:()=>debits,
    run:()=>autoHealRaidEntryCombatPet({client,player,choosePotion,persistPet})}
}

test('Raid recupera pet iniciado em zero HP e debita uma poção exatamente uma vez',async()=>{
  const f=fixture({hp:0,energy:12,stock:4})
  const result=await f.run()
  assert.equal(result.hp,2600)
  assert.equal(result.heal,2600)
  assert.equal(result.remaining,3)
  assert.equal(f.player.pet.hp,2600)
  assert.equal(f.player.petPotionHealing,2600)
  assert.equal(f.player.petPotionUses,1)
  assert.equal(f.remaining(),3)
  assert.equal(f.heals(),1)
  assert.equal(f.audits(),1)
  assert.equal(f.debits(),1)
  assert.equal(await f.run(),null)
  assert.equal(f.debits(),1)
})
test('pet sem energia pode recuperar HP antes do energético automático da Raid',async()=>{
  const f=fixture({hp:0,energy:0,stock:2})
  assert.equal((await f.run()).hp,2600)
  assert.equal(f.player.pet.energy,0)
  assert.equal(f.debits(),1)
})
test('limite diário segue bloqueando a autocura sem consumir inventário nem alterar HP',async()=>{
  const f=fixture({hp:0,energy:12,stock:8,used:MAX_PET_AUTO_POTIONS_PER_DAY})
  assert.equal(await f.run(),null)
  assert.equal(f.player.pet.hp,0)
  assert.equal(f.player.petPotionUses,0)
  assert.equal(f.remaining(),8)
  assert.equal(f.heals(),0)
  assert.equal(f.audits(),0)
})
test('pet vivo ou sem poções não sofre consumo automático',async()=>{
  const healthy=fixture({hp:1200,stock:4})
  assert.equal(await healthy.run(),null)
  assert.equal(healthy.debits(),0)
  const empty=fixture({hp:0,stock:0})
  assert.equal(await empty.run(),null)
  assert.equal(empty.player.pet.hp,0)
  assert.equal(empty.debits(),0)
})
test('fluxo da Raid recupera HP antes de recarregar energia e de avaliar roundActive',()=>{
  const code=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  const begin=code.indexOf('for(const p of alive){',code.indexOf('export async function raidRound'))
  const segment=code.slice(begin,code.indexOf('const equippedRaidRelic',begin))
  const healed=segment.indexOf('const entryPetHeal=await autoHealRaidEntryCombatPet(')
  const energy=segment.indexOf('let raidAutoPetEnergy=null')
  const active=segment.indexOf('p.pet.roundActive=Number(p.pet.energy)>0&&Number(p.pet.hp)>0')
  assert.ok(healed>0&&healed<energy&&energy<active)
  assert.match(segment,/type:'pet_auto_heal'/)
  const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(bot,/\['boss','pet_auto_heal'\]\.includes\(e\.type\)/)
})
