// !autoforja — planejamento puro. Usa apenas equipamentos, fragmentos e saldo
// ja pertencentes ao jogador. Nao compra copias, nao usa item equipado/vinculado
// como doador e nao permite completar etapas sem financiamento.
export const AUTO_FORGE_BASE_FEE_PER_STAR=25000
export const AUTO_FORGE_SURCHARGE_RATE=0.10
export const AUTO_FORGE_PLAN_VERSION='inventory-auto-v1'
const ints=(n,label)=>{
  const v=Number(n)
  if(!Number.isSafeInteger(v)||v<0)throw new Error('Dados invalidos da autoforja: '+label)
  return v
}
const upgradeCost=(base,level)=>{
  const lv=ints(level,'nivel'),cost=ints(base,'valor')
  if(lv<1||lv>10)throw new Error('Nivel invalido da copia.')
  return cost*(45-(lv-1)*lv/2)
}
const serviceCost=base=>AUTO_FORGE_BASE_FEE_PER_STAR+Math.ceil(base*AUTO_FORGE_SURCHARGE_RATE/1000)*1000

export function planInventoryAutoForge(input){
  const itemId=String(input.itemId||'')
  const category=String(input.category||'')
  const quantity=ints(input.quantity,'quantidade')
  const cash=ints(input.cash,'carteira'),bank=ints(input.bank,'banco')
  const availableCash=cash+bank
  const upgradeBase=ints(input.upgradeBase,'preco upgrade')
  const forged=input.forged||null
  const stars=forged?ints(forged.stars,'estrelas'):1
  const forgedLevel=forged?ints(forged.level,'nivel forjado'):0
  const isShield=category==='shield',isCollab=Boolean(input.collab)
  if(!['weapon','armor','shield'].includes(category)||!itemId||stars<1||stars>5||stars===5||quantity<1||upgradeBase<1)
    return null
  if(forged&&(forgedLevel<1||forgedLevel>10))return null
  const bound=ints(input.bound,'copias vinculadas'),equipped=Boolean(input.equipped)
  if(bound>quantity)return null
  const tiers=(input.tiers||[]).map(r=>({level:ints(r.level,'nivel da copia'),qty:ints(r.quantity,'copia')}))
  if(tiers.some(t=>t.level<2||t.level>10))return null
  const commonCount=quantity-(forged?1:0)
  if(tiers.reduce((n,t)=>n+t.qty,0)>commonCount)return null
  const commonLevels=[
    ...tiers.flatMap(t=>Array(t.qty).fill(t.level)),
    ...Array(commonCount-tiers.reduce((n,t)=>n+t.qty,0)).fill(1)
  ].sort((a,b)=>b-a)
  // Cópias vinculadas não são identificadas por nível no banco:
  // reservar conservadoramente as mais evoluídas, nunca escolhê-las como doadoras.
  // Quando já existe peça estrelada, preservar TODAS as cópias comuns vinculadas;
  // a própria peça estrelada (principal) fica protegida separadamente.
  let principalLevel=forgedLevel
  let protectedExtra=forged?bound:Math.max(0,bound+(equipped?1:0)-1)
  if(!forged){
    if(isShield){
      // A forja manual exige DUAS cópias comuns Lv.1 na primeira estrela.
      // Não sacrificar a cópia já aprimorada para completar este requisito.
      const idx=commonLevels.lastIndexOf(1)
      if(idx<0 || commonLevels.filter(l=>l===1).length<2)return null
      principalLevel=commonLevels.splice(idx,1)[0]
    }else{
      principalLevel=commonLevels.shift()||1
    }
  }
  for(let k=0;k<protectedExtra&&commonLevels.length;k++)commonLevels.shift()
  const maxFree=Math.max(0,quantity-bound-(equipped?1:0))
  let donors=isCollab?[]:commonLevels.slice().sort((a,b)=>b-a).slice(0,maxFree)
  if(isShield)donors=donors.filter(l=>l===1)
  if(!isCollab&&!donors.length)return null
  const materialId=String(input.materialId||'')
  const materials=ints(input.materials||0,'fragmentos')
  const materialCosts=input.materialCosts||[0,30,50,80,120]
  let steps=[],total=0,totalUpgrades=0,totalForgeFees=0,totalService=0,
      fragments=0,donorLevels=[],paid=new Map()
  const consumedTier=(level)=>{
    if(level>1)paid.set(level,(paid.get(level)||0)+1)
  }
  let sourceLevel=principalLevel,usedMain=false,star=stars
  const limit=5-stars
  for(let i=0;i<limit;i++){
    const donor=!isCollab?donors[i]:null
    if(!isCollab&&donor===undefined)break
    const materialNeed=isShield||Boolean(input.shopStandard)?0:ints(materialCosts[star],'exigencia fragmentos')
    if(!isShield&&!input.shopStandard&&!materialId)break
    if(fragments+materialNeed>materials)break
    const mainUpgrade=upgradeCost(upgradeBase,sourceLevel)
    const donorUpgrade=!isCollab&&!isShield?upgradeCost(upgradeBase,donor):0
    // Cada estrela volta ao Lv.1; deixar Lv.10 no fim, sem custo oculto posterior.
    const resetUpgrade=upgradeCost(upgradeBase,1)
    const upgrades=mainUpgrade+donorUpgrade+resetUpgrade
    const forgeFee=isShield?ints(input.shieldFees?.[star],'custo escudo'):0
    const fee=serviceCost(upgrades+forgeFee)
    const cost=upgrades+forgeFee+fee
    const entry={fromStars:star,toStars:star+1,principalFrom:sourceLevel,
      donorLevel:donor,materials:materialNeed,mainUpgrade,donorUpgrade,
      resetUpgrade,upgrades,forgeFee,serviceFee:fee,total:cost}
    if(total+cost>availableCash){
      // Se nenhuma etapa cabe no saldo, ainda exibir a proposta e a falta;
      // nunca prosseguir automaticamente com saldo insuficiente.
      if(steps.length===0)return {itemId,name:input.name,category,rarity:input.rarity,
        starsBefore:stars,starsAfter:star,steps:[],firstStep:entry,
        potential:true,shortage:cost-availableCash,cash,bank,
        total:cost,canExecute:false,reason:'saldo',
        quoteKey:JSON.stringify([AUTO_FORGE_PLAN_VERSION,itemId,quantity,tiers,forged,bound,equipped,materials,cash,bank])}
      break
    }
    if(!usedMain&&!forged){consumedTier(principalLevel);usedMain=true}
    if(donor!==null&&donor!==undefined){consumedTier(donor);donorLevels.push(donor)}
    steps.push(entry);total+=cost;totalUpgrades+=upgrades
    totalForgeFees+=forgeFee;totalService+=fee;fragments+=materialNeed
    star++;sourceLevel=10
  }
  if(!steps.length)return null
  const consumedTiers=[...paid].map(([level,qty])=>({level,qty})).sort((a,b)=>a.level-b.level)
  const snapshot=[AUTO_FORGE_PLAN_VERSION,itemId,quantity,tiers.sort((a,b)=>a.level-b.level),forged,
    bound,equipped,materials,cash,bank,upgradeBase,isShield,isCollab,Boolean(input.shopStandard),
    input.shieldFees||{},stars,steps.map(s=>[s.toStars,s.donorLevel,s.total]),total]
  return {itemId,name:input.name,category,rarity:input.rarity,
    quantityBefore:quantity,quantityAfter:quantity-donorLevels.length,
    starsBefore:stars,starsAfter:star,principalLevel,finalLevel:10,
    donorLevels,consumedTiers,fragments,materialId,materialName:input.materialName||'',
    upgrades:totalUpgrades,forgeFees:totalForgeFees,serviceFee:totalService,total,
    cash,bank,shortage:0,canExecute:true,steps,quoteKey:JSON.stringify(snapshot)}
}
