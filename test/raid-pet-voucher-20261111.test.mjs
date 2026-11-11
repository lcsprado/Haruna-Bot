import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  RAID_PET_VOUCHER_ID,voucherRaidCatalog,voucherRaidMenu,voucherPetMenu,
  voucherSelectedPet,voucherPetBonus,voucherPetSynergy,redeemRaidPetVoucher
} from '../src/neon/raid-pet-voucher.js'
import {VITAL_PETS} from '../src/neon/vital-pets.js'

const altars=[
 {raidLevel:40,materialId:'fragmento_celestial',pets:[
  {species:'grifo_celestial',name:'✨ Grifo Celestial',power:290},
  {species:'cervo_aurora_viva',name:'🦌 Cervo da Aurora Viva',power:315}
 ]},
 {raidLevel:70,materialId:'essencia_eclipse',pets:[
  {species:'avatar_primordial',name:'🌌 Avatar Primordial',power:435},
  {species:'leviata_eternidade',name:'🌊 Leviatã da Eternidade',power:430}
 ]}
]
function fakePool({voucher=1,existingPet=null,failOn=null}={}){
 let stock=voucher,petCount=0,txCount=0
 const statements=[]
 const client={
  async query(sql,params=[]){
   statements.push(sql)
   if(failOn&&sql.includes(failOn))throw Error('Falha simulada')
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))return {rows:[]}
   if(sql.startsWith('SELECT jid FROM users'))return {rows:[{jid:params[0]}]}
   if(sql.startsWith('SELECT quantity FROM inventories'))return {rows:stock>0?[{quantity:stock}]:[]}
   if(sql.startsWith('SELECT id FROM pet_collection'))return {rows:existingPet?[{id:77}]:[]}
   if(sql.startsWith('INSERT INTO pet_collection')){petCount++;return {rows:[{id:501+petCount}]}}
   if(sql.startsWith('UPDATE inventories')){if(stock<=0)return {rows:[]};stock--;return {rows:[{quantity:stock}]}}
   if(sql.startsWith('INSERT INTO transactions')){txCount++;return {rows:[]}}
   throw Error('SQL não previsto: '+sql.slice(0,90))
  },
  release(){statements.push('RELEASE')}
 }
 return {async connect(){return client},get stock(){return stock},get petCount(){return petCount},get txCount(){return txCount},statements}
}
const redeem=(pool,species='avatar_primordial')=>redeemRaidPetVoucher({
 pool,jid:'player@s.whatsapp.net',selectedSpecies:species,altars,
 petMaxHp:(level,xp,s)=>150+level*12,
 petMaxEnergy:(level,s)=>100+level*2
})
test('catálogo único: pet elegível precisa pertencer às Raids disponíveis, incluindo Vital',()=>{
 const raids=voucherRaidCatalog(altars)
 assert.deepEqual(raids.map(x=>x.raidLevel),[40,70])
 assert.ok(voucherRaidMenu(altars).includes('Raid 70'))
 assert.equal(voucherSelectedPet(altars,2,1)?.species,'avatar_primordial')
 assert.equal(voucherSelectedPet(altars,1,2)?.species,'cervo_aurora_viva')
 assert.equal(voucherSelectedPet(altars,2,999),null)
 assert.equal(voucherSelectedPet(altars,999,1),null)
 assert.ok(VITAL_PETS.some(x=>x.species==='leviata_eternidade'))
})
test('mostra números, estilo, bônus, sinergias e pets já possuídos sem consumo',()=>{
 const msg=voucherPetMenu(altars,2,()=> '✨ Místico',['leviata_eternidade'])
 assert.match(msg,/1\.\* 🌌 Avatar Primordial/)
 assert.match(msg,/2\.\* 🌊 Leviatã da Eternidade ✅ JÁ POSSUI/)
 assert.match(msg,/Elo Arcano/)
 assert.match(msg,/Vínculo Vital/)
 assert.match(msg,/Bônus:/)
 assert.match(msg,/99️⃣ Voltar/)
 assert.match(voucherPetSynergy('avatar_primordial','✨ Místico'),/\+2,5 p\.p\. CRIT/)
 assert.match(voucherPetBonus('avatar_primordial'),/\+/)
})
test('redeem: 1 vale, 1 pet, 1 transação, sem alterar carteira',async()=>{
 const pool=fakePool()
 const r=await redeem(pool)
 assert.equal(r.species,'avatar_primordial')
 assert.equal(r.raidLevel,70)
 assert.equal(r.level,70)
 assert.equal(r.remaining,0)
 assert.equal(pool.stock,0)
 assert.equal(pool.petCount,1)
 assert.equal(pool.txCount,1)
 assert.equal(pool.statements.filter(s=>s==='COMMIT').length,1)
 assert.ok(!pool.statements.some(s=>/wallets|cash=|bank=/.test(s)))
 assert.ok(pool.statements.some(s=>s.includes('INSERT INTO pet_collection')))
 assert.ok(pool.statements.some(s=>s.includes('UPDATE inventories')))
 assert.ok(pool.statements.some(s=>s.includes('INSERT INTO transactions')))
})
test('repetido, sem vale, pet inválido e falha SQL não concluem resgate',async()=>{
 for(const scenario of [
  {pool:fakePool({existingPet:true}),species:'avatar_primordial',message:/já possui/},
  {pool:fakePool({voucher:0}),species:'avatar_primordial',message:/não possui/},
  {pool:fakePool(),species:'qualquer',message:/não elegível/},
  {pool:fakePool({failOn:'INSERT INTO pet_collection'}),species:'avatar_primordial',message:/Falha simulada/}
 ]){
  await assert.rejects(redeem(scenario.pool,scenario.species),scenario.message)
  assert.equal(scenario.pool.txCount,0)
  assert.equal(scenario.pool.statements.filter(s=>s==='COMMIT').length,0)
  if(scenario.species!=='qualquer')assert.equal(scenario.pool.statements.filter(s=>s==='ROLLBACK').length,1)
 }
})
test('caminhos públicos no bot: !escolherpet, !usar, inventário e confirmação numérica',()=>{
 const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 const flow=readFileSync(new URL('../src/neon/raid-pet-voucher-flow.js',import.meta.url),'utf8')
 assert.match(index,/\['escolherpet','resgatarvale','usardomador'\]/)
 assert.match(index,/openRaidPetVoucherMenu\(chat,sender,reply\)/)
 assert.match(index,/item\.item_id===RAID_PET_VOUCHER_ID/)
 assert.match(index,/handleRaidPetVoucherFlow\(\{flow,input,sender,reply/)
 assert.match(flow,/flow\.stage==='voucher_pet_confirm'/)
 assert.match(flow,/input!=='1'/)
 assert.match(flow,/redeemRaidPetVoucher\(/)
 assert.equal(RAID_PET_VOUCHER_ID,'voucher_mercado_negro_petraid_20261105')
})
