// Fluxo interativo do Vale Domador de Lendas: cada usuário escolhe Raid, pet e confirma.
// Os menus ficam no fluxo individual do jogador; nenhuma seleção numérica concede
// um pet antes de uma confirmação explícita. O banco é autoridade do resgate.
import {
  RAID_PET_VOUCHER_ID,voucherRaidCatalog,voucherRaidMenu,voucherPetMenu,
  voucherSelectedPet,voucherPetBonus,voucherPetSynergy,redeemRaidPetVoucher
} from './raid-pet-voucher.js'

const TTL=5*60*1000
async function hasVoucher(sender,ctx){
  const items=await ctx.getInventory(sender)
  return items.some(i=>i.item_id===RAID_PET_VOUCHER_ID&&Number(i.quantity)>0)
}
export async function startRaidPetVoucherFlow({sender,reply,requestedRaid=null,setFlow,clearFlow,...ctx}){
  if(!(await hasVoucher(sender,ctx))){
    clearFlow()
    await reply('🎟️ Você não possui um Vale Domador de Lendas disponível. Confira em *!inventario* → *Materiais de Raid / Outros*.')
    return true
  }
  const raids=voucherRaidCatalog(ctx.altars)
  const wanted=Number(requestedRaid)
  const position=requestedRaid!==null&&requestedRaid!==undefined
    ?raids.findIndex(r=>r.raidLevel===wanted)+1:0
  if(requestedRaid!==null&&requestedRaid!==undefined&&!position){
    setFlow('voucher_raid_select',{},TTL)
    await reply('⚠️ Raid inválida para este vale.\n\n'+voucherRaidMenu(ctx.altars))
    return true
  }
  if(position){
    const pets=await ctx.listPets(sender)
    setFlow('voucher_pet_select',{raidPosition:position},TTL)
    await reply(voucherPetMenu(ctx.altars,position,ctx.styleLabel,pets.map(p=>p.species)))
    return true
  }
  setFlow('voucher_raid_select',{},TTL)
  await reply(voucherRaidMenu(ctx.altars))
  return true
}
export async function handleRaidPetVoucherFlow({flow,input,sender,reply,setFlow,clearFlow,...ctx}){
  if(!String(flow?.stage||'').startsWith('voucher_'))return false
  if(flow.stage==='voucher_raid_select'){
    const raids=voucherRaidCatalog(ctx.altars)
    const pos=Number(input)
    if(!/^\d+$/.test(input)||!Number.isSafeInteger(pos)||pos<1||pos>raids.length){
      await reply('🎟️ Escolha o número de uma Raid de *1 a '+raids.length+'* ou *0* para cancelar.')
      return true
    }
    const pets=await ctx.listPets(sender)
    setFlow('voucher_pet_select',{raidPosition:pos},TTL)
    await reply(voucherPetMenu(ctx.altars,pos,ctx.styleLabel,pets.map(p=>p.species)))
    return true
  }
  if(flow.stage==='voucher_pet_select'){
    if(input==='99'){
      setFlow('voucher_raid_select',{},TTL)
      await reply(voucherRaidMenu(ctx.altars))
      return true
    }
    const pos=Number(flow.data?.raidPosition)
    const chosen=voucherSelectedPet(ctx.altars,pos,input)
    if(!chosen){
      await reply('🐾 Escolha um número de pet da lista, *99* para voltar às Raids ou *0* para cancelar.')
      return true
    }
    const pets=await ctx.listPets(sender)
    if(pets.some(p=>p.species===chosen.species)){
      await reply('✅ Você já possui esse pet. Escolha outro; nenhum vale foi consumido.')
      return true
    }
    setFlow('voucher_pet_confirm',{raidPosition:pos,species:chosen.species},TTL)
    const style=ctx.styleLabel(chosen.species)
    await reply('🎟️ *CONFIRMAR RESGATE DO VALE DOMADOR?*\n\n'+
      '🐾 *'+chosen.name+'*\n'+
      '⚔️ Raid '+chosen.raidLevel+' • Poder inicial '+chosen.power+'\n'+
      '🎭 '+style+'\n'+
      '✨ Bônus: '+voucherPetBonus(chosen.species)+'\n'+
      '🤝 '+voucherPetSynergy(chosen.species,style)+'\n\n'+
      '1️⃣ *CONFIRMAR — consumir 1 vale e receber o pet*\n'+
      '2️⃣ Voltar à lista\n0️⃣ Cancelar\n\n'+
      '📌 Resgate definitivo, sem cobrança de dinheiro ou materiais.')
    return true
  }
  if(flow.stage==='voucher_pet_confirm'){
    const pos=Number(flow.data?.raidPosition)
    if(input==='2'){
      const pets=await ctx.listPets(sender)
      setFlow('voucher_pet_select',{raidPosition:pos},TTL)
      await reply(voucherPetMenu(ctx.altars,pos,ctx.styleLabel,pets.map(p=>p.species)))
      return true
    }
    if(input!=='1'){
      await reply('🎟️ Escolha *1* para confirmar, *2* para voltar ou *0* para cancelar.')
      return true
    }
    try{
      const result=await redeemRaidPetVoucher({
        pool:ctx.pool,jid:sender,selectedSpecies:flow.data?.species,
        altars:ctx.altars,petMaxHp:ctx.petMaxHp,petMaxEnergy:ctx.petMaxEnergy
      })
      clearFlow()
      await reply('🎟️🐾 *VALE DOMADOR RESGATADO!*\n\n'+
        '✅ Pet: *'+result.name+'*\n'+
        '⚔️ Raid '+result.raidLevel+' • ⭐ Nível '+result.level+' • Poder '+result.power+'\n'+
        '🆔 Pet #'+result.petId+'\n🎟️ Vales restantes: *'+result.remaining+'*\n\n'+
        '✅ Pet entregue à coleção. Use *!meuspets* ou *!equiparpet* para equipar.')
    }catch(err){
      clearFlow()
      await reply('❌ *RESGATE NÃO CONCLUÍDO*\n'+
        String(err?.message||'Falha no resgate.')+
        '\nNenhum vale foi consumido se a operação falhou. Use *!escolherpet* para tentar novamente.')
    }
    return true
  }
  return false
}
