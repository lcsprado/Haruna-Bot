// Resgate oficial do Vale Domador de Lendas. Não depende de comandos admin.
// O catálogo vem da MESMA lista de pets obtidos pelos Altares das Raids.
// Regras de sinergia e especialidades são as já vigentes no jogo.
import {PET_STATUS_SPECIALTIES} from './game-catalog.js'

export const RAID_PET_VOUCHER_ID='voucher_mercado_negro_petraid_20261105'

const TEAM_SYNERGIES=Object.freeze([
  {match:'voador',label:'🪽 Esquadrão Aéreo',detail:'com 3 Voadores: +8 VEL e +2% ATK'},
  {match:'guardião',label:'🛡️ Muralha Viva',detail:'com 3 Guardiões: +4% DEF no Boss/Raid'},
  {match:'predador',label:'🐾 Caçada Coordenada',detail:'com 3 Predadores: +2% ATK e +2 p.p. CRIT no Boss/Raid'},
  {match:'místico',label:'✨ Elo Arcano',detail:'com 3 Místicos: +2% DEF e +2,5 p.p. CRIT no Boss/Raid'},
  {match:'vital',label:'💚 Vínculo Vital — Coração Eterno',detail:'com 3 VITAIS diferentes: +8% HP, -2% dano recebido e 1 cura de 5% HP em combate'}
])

const cleanNumber=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:1})
export function voucherRaidCatalog(altars=[]){
  return (Array.isArray(altars)?altars:[])
    .filter(a=>Number.isSafeInteger(Number(a.raidLevel))&&Number(a.raidLevel)>0&&Array.isArray(a.pets)&&a.pets.length>0)
    .map(a=>({
      raidLevel:Number(a.raidLevel),
      materialId:String(a.materialId||''),
      pets:a.pets.filter(p=>p?.species&&p?.name&&Number(p.power)>0).map(p=>({
        species:String(p.species),name:String(p.name),power:Number(p.power)
      }))
    }))
    .filter(a=>a.pets.length>0)
    .sort((a,b)=>a.raidLevel-b.raidLevel)
}
export function voucherRaidMenu(altars){
  const raids=voucherRaidCatalog(altars)
  let message='🎟️🐾 *VALE DOMADOR DE LENDAS — ESCOLHA SUA RAID*\n\n'
  message+='O vale permite escolher *1 pet lendário* de qualquer Raid disponível.\nNenhum item é consumido para consultar.\n\n'
  raids.forEach((r,i)=>message+=`*${i+1}.* ⚔️ Raid ${r.raidLevel} — ${r.pets.length} pets disponíveis\n`)
  message+='\n👉 Responda com o *número da Raid*.\n0️⃣ Cancelar'
  return message
}
export function voucherPetSynergy(species,styleLabel=''){
  const style=String(styleLabel||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  // Vínculo Vital é uma combinação própria de três espécies, não a sinergia comum.
  const vital=String(PET_STATUS_SPECIALTIES[String(species||'')]?.label||'').toLowerCase().includes('vínculo vital')
  const rule=vital?TEAM_SYNERGIES[4]:TEAM_SYNERGIES.find(r=>style.includes(r.match.normalize('NFD').replace(/[\u0300-\u036f]/g,'')))
  return rule?`${rule.label}: ${rule.detail}`:'Nenhuma sinergia de trio cadastrada para este pet'
}
export function voucherPetBonus(species){
  const spec=PET_STATUS_SPECIALTIES[String(species||'')]
  if(!spec)return 'Especialidade não cadastrada'
  const raw=spec.stats||{[spec.stat]:spec.base}
  const labels={damage:'dano',bossDamage:'dano Boss',defense:'DEF',crit:'CRIT',dodge:'esquiva',hp:'HP',speed:'VEL',xp:'XP',drop:'drop'}
  const attrs=Object.entries(raw).filter(([,value])=>Number(value)>0)
    .map(([key,value])=>`+${cleanNumber(value)}${key==='speed'?'':'%'} ${labels[key]||key}`)
  if(Number(spec.healPct)>0&&Number(spec.healCooldown)>0)attrs.push(`cura ${cleanNumber(spec.healPct)}% HP a cada ${Number(spec.healCooldown)} rodadas (abaixo de 70%)`)
  return attrs.join(' • ')||'Sem bônus individual cadastrado'
}
export function voucherPetMenu(altars,raidPosition,styleLabel=()=>'',ownedSpecies=[]){
  const raids=voucherRaidCatalog(altars)
  const raid=raids[Number(raidPosition)-1]
  if(!raid)return null
  const owned=new Set((Array.isArray(ownedSpecies)?ownedSpecies:[]).map(String))
  let message=`🐾 *VALE DOMADOR — PETS DA RAID ${raid.raidLevel}*\n\n`
  raid.pets.forEach((pet,index)=>{
    const style=styleLabel(pet.species)
    message+=`*${index+1}.* ${pet.name}${owned.has(pet.species)?' ✅ JÁ POSSUI':''}\n`
    message+=`    ⚔️ Poder inicial: ${pet.power} • 🎭 ${style}\n`
    message+=`    ✨ Bônus: ${voucherPetBonus(pet.species)}\n`
    message+=`    🤝 ${voucherPetSynergy(pet.species,style)}\n`
  })
  message+='\n👉 Escolha o *número do pet* para revisar e confirmar.\n99️⃣ Voltar às Raids • 0️⃣ Cancelar'
  return message
}
export function voucherSelectedPet(altars,raidPosition,petPosition){
  const raid=voucherRaidCatalog(altars)[Number(raidPosition)-1]
  const n=Number(petPosition)
  if(!raid||!Number.isSafeInteger(n)||n<1||n>raid.pets.length)return null
  return {...raid.pets[n-1],raidLevel:raid.raidLevel}
}
export async function redeemRaidPetVoucher({pool,jid,selectedSpecies,altars,petMaxHp,petMaxEnergy}){
  const chosen=voucherRaidCatalog(altars).flatMap(r=>r.pets.map(p=>({...p,raidLevel:r.raidLevel})))
    .find(p=>p.species===String(selectedSpecies||''))
  if(!chosen)throw Error('Pet não elegível para o Vale Domador de Lendas.')
  if(!jid||typeof pool?.connect!=='function')throw Error('Não foi possível validar a conta.')
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    await client.query("SET LOCAL statement_timeout='12000ms'")
    // Mesmo lock usado nas transações usuais de pet: serializa operações do jogador.
    const user=(await client.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!user)throw Error('Jogador não encontrado.')
    const inv=(await client.query(
      'SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,RAID_PET_VOUCHER_ID]
    )).rows[0]
    if(!inv||Number(inv.quantity)<1)throw Error('Você não possui um Vale Domador de Lendas disponível.')
    const owned=(await client.query(
      'SELECT id FROM pet_collection WHERE jid=$1 AND species=$2 LIMIT 1 FOR UPDATE',[jid,chosen.species]
    )).rows[0]
    if(owned)throw Error('Você já possui esse pet. Escolha outra espécie; seu vale foi preservado.')
    const level=Math.min(100,Math.max(1,Math.trunc(chosen.raidLevel)))
    const xp=(level-1)*100
    const energy=Number(petMaxEnergy(level,chosen.species))
    const hp=Number(petMaxHp(level,xp,chosen.species))
    if(!Number.isFinite(hp)||hp<1||!Number.isFinite(energy)||energy<1)throw Error('Atributos do pet indisponíveis.')
    const name=chosen.name.replace(/^[^\p{L}\p{N}]+/u,'').slice(0,24)
    const pet=(await client.query(
      'INSERT INTO pet_collection(jid,species,name,level,xp,energy,power,hp,max_hp,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,FALSE) RETURNING id',
      [jid,chosen.species,name,level,xp,energy,chosen.power,hp]
    )).rows[0]
    if(!pet?.id)throw Error('Entrega do pet falhou; vale não consumido.')
    const deducted=(await client.query(
      'UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2 AND quantity>=1 RETURNING quantity',
      [jid,RAID_PET_VOUCHER_ID]
    )).rows[0]
    if(!deducted)throw Error('Vale indisponível; operação desfeita.')
    await client.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',0,'raid_pet_voucher_redeem',$2)",
      [jid,`vale_domador:${chosen.species}:raid:${chosen.raidLevel}:pet:${pet.id}`]
    )
    await client.query('COMMIT')
    return {...chosen,name,petId:Number(pet.id),level,remaining:Number(deducted.quantity)}
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{})
    throw error
  }finally{client.release()}
}
