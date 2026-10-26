import test from 'node:test'
import assert from 'node:assert/strict'
import {autoHealBossCombatPet} from '../src/neon/boss-pet-autocure.js'

function scenario({hp=0,maxHp=3013,slot=3,quantities={pocao_pet_suprema:38}}={}){
  const stock=new Map(Object.entries(quantities))
  const writes=[]
  const client={async query(sql,params){
    if(sql.startsWith('SELECT item_id,quantity FROM inventories')){
      return {rows:[...stock].filter(([,qty])=>qty>0).map(([item_id,quantity])=>({item_id,quantity}))}
    }
    if(sql.startsWith('UPDATE inventories')){
      const item=params[1],qty=stock.get(item)||0
      if(!qty)return {rowCount:0,rows:[]}
      stock.set(item,qty-1)
      return {rowCount:1,rows:[{quantity:qty-1}]}
    }
    throw Error('Unexpected SQL '+sql)
  }}
  const pet={hp,max_hp:maxHp,name:'Dragão Corrompido',teamSlot:slot,petFainted:hp<=0}
  const heals={pocao_pet_comum:60,pocao_pet_rara:160,pocao_pet_epica:320,pocao_pet_suprema:800,pocao_pet_full:999999}
  const choosePotion=(rows,missing)=>{
    const possible=rows.filter(x=>x.quantity>0).map(x=>({...x,heal:heals[x.item_id],name:x.item_id}))
      .sort((a,b)=>a.heal-b.heal)
    return possible.find(x=>x.heal>=missing)||possible.at(-1)||null
  }
  const persistPet=async(c,jid,p)=>writes.push({jid,hp:p.hp,slot:p.teamSlot})
  return {pet,stock,writes,run:()=>autoHealBossCombatPet({
    client,jid:'test-jid',pet,maxHp,choosePotion,persistPet
  })}
}

test('pet de reserva em 0 HP volta ao Boss com poção disponível',async()=>{
  const s=scenario()
  const r=await s.run()
  assert.equal(s.pet.hp,800)
  assert.equal(s.pet.petFainted,false)
  assert.equal(s.stock.get('pocao_pet_suprema'),37)
  assert.deepEqual(s.writes,[{jid:'test-jid',hp:800,slot:3}])
  assert.equal(r.remaining,37)
})
test('pet principal ou reserva não consome poção sem falta de HP',async()=>{
  const s=scenario({hp:3013,slot:1})
  assert.equal(await s.run(),null)
  assert.equal(s.stock.get('pocao_pet_suprema'),38)
  assert.equal(s.writes.length,0)
})
test('sem poções não recupera nem altera o pet',async()=>{
  const s=scenario({quantities:{}})
  assert.equal(await s.run(),null)
  assert.equal(s.pet.hp,0)
  assert.equal(s.writes.length,0)
})
test('poção full recupera corretamente e debita uma unidade',async()=>{
  const s=scenario({hp:0,quantities:{pocao_pet_suprema:2,pocao_pet_full:3}})
  const r=await s.run()
  assert.equal(r.hp,3013)
  assert.equal(r.heal,3013)
  assert.equal(s.stock.get('pocao_pet_full'),2)
  assert.equal(s.stock.get('pocao_pet_suprema'),2)
})
test('ao atingir 35% com HP acima de zero aplica a menor poção adequada',async()=>{
  const s=scenario({hp:1000,quantities:{pocao_pet_suprema:38}})
  const r=await s.run()
  assert.equal(r.hp,1800)
  assert.equal(r.heal,800)
  assert.equal(s.stock.get('pocao_pet_suprema'),37)
})
