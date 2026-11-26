// V2 cash basis: only actual debits, never theoretical level costs or free grants.
// Old sales lack copy-level detail: reset that model's basis conservatively.
import {selectEffectiveGear} from './equipment-star-logic.js'
const int=v=>Math.max(0,Math.trunc(Number(v)||0))
export function replayPaidGear(rows=[]){
 const normal=new Map();let star=0
 const list=lv=>{if(!normal.has(lv))normal.set(lv,[]);return normal.get(lv)}
 const take=lv=>{const a=list(lv);a.sort((x,y)=>x-y);return a.shift()||0}
 const put=(lv,amount)=>{if(amount>0)list(lv).push(amount)}
 const remove=(lv,amount)=>{const a=list(lv),i=a.indexOf(amount);if(i>=0)a.splice(i,1)}
 for(const row of rows){
  const note=String(row.note||''),amount=int(row.amount),type=row.type
  if(type==='sale'||type==='sale_batch'){
   const paid=note.match(/\|paid_sale:([^|]*)\|remaining:(\d+)/)
   if(!paid||Number(paid[2])===0){normal.clear();star=0;continue}
   for(const token of paid[1].split(',').filter(Boolean)){
    const [kind,level,cost]=token.split('.')
    if(kind==='s')star=0
    else if(kind==='n')remove(int(level),int(cost))
   }
   continue
  }
  if(type==='equipment_upgrade'){
   const m=note.match(/ (COPY|STAR) Lv\.(\d+)->Lv\.(\d+)$/)
   if(!m)continue
   if(m[1]==='STAR')star+=amount
   else put(int(m[3]),take(int(m[2]))+amount)
   continue
  }
  if(['equipment_star_forge','equipment_star_forge_shield','equipment_star_forge_collab_fragments'].includes(type)){
   const m=note.match(/★(\d+)->★(\d+)/)
   if(!m)continue
   const before=int(m[1])
   const donors=type==='equipment_star_forge_shield'?0:type==='equipment_star_forge_collab_fragments'?(before===1?1:0):(before===1?2:1)
   if(before===1)star=0
   for(let i=0;i<donors;i++)star+=take(10)
   star+=amount
   continue
  }
  if(type==='equipment_shop_forge5'){
   const principal=note.match(/principal_Lv (\d+)/),donors=note.match(/doadoras_Lv ([\d,]+)/)
   // Explicit tiers in the receipt; don't credit newly purchased base equipment twice.
   const costs=['aprimoramento','forja','servico'].map(k=>int(note.match(new RegExp('\\| '+k+' (\\d+)'))?.[1]))
   if(principal&&!star)star+=take(int(principal[1]))
   for(const lv of (donors?.[1]||'').split(',').filter(Boolean))star+=take(int(lv))
   star+=Math.min(amount,costs.reduce((a,b)=>a+b,0))
   continue
  }
  if(type==='equipment_inventory_auto_forge'){
   // The old autoforge receipt does not specify the donor tiers. Discard the
   // ambiguous normal basis rather than assigning it to the wrong copy.
   normal.clear()
   star+=amount
  }
 }
 return {normal,star}
}
export function paidGearSaleSteps({rows=[],quantity,tiers=[],forge=null,equipped=false,itemId=''}){
 const owned=int(quantity),ordered=tiers.map(t=>({level:int(t.level),quantity:int(t.quantity)})).sort((a,b)=>a.level-b.level)
 const basic=owned-ordered.reduce((n,t)=>n+t.quantity,0)-(forge?1:0)
 if(basic<0)return []
 const {normal,star}=replayPaidGear(rows)
 const highest=ordered.at(-1)?.level||1
 const effective=forge&&equipped?selectEffectiveGear(highest,forge.level,forge.stars,itemId):null
 const keepForge=Boolean(effective&&effective.level===Number(forge.level)&&(effective.stars>1||effective.level!==highest))
 const keepTier=equipped&&!keepForge&&ordered.length?highest:null
 const keepBasic=equipped&&!keepForge&&keepTier===null?1:0
 let at=Math.max(0,basic-keepBasic);const result=[]
 for(const tier of ordered){
   const count=tier.quantity,free=count-(keepTier===tier.level?1:0)
   // Copies with no proven basis are sold first. Preserve the highest paid
   // copy of the equipped tier; never refund a granted copy without a debit.
   const known=(normal.get(tier.level)||[]).slice().sort((a,b)=>a-b).slice(0,count)
   const zero=count-known.length
   for(let k=zero;k<free;k++){
    const basis=known[k-zero]
    if(basis>0)result.push({at:at+k+1,kind:'n',level:tier.level,basis})
   }
   at+=free
 }
 if(forge&&!keepForge&&star>0)result.push({at:at+1,kind:'s',level:int(forge.level),basis:star})
 return result
}
export function paidGearRefund(steps=[],qty=0){
 return Math.floor(steps.filter(s=>s.at<=qty).reduce((n,s)=>n+int(s.basis),0)/2)
}
export function paidGearSaleMarker(steps=[],qty=0,remaining=0){
 return '|paid_sale:'+steps.filter(s=>s.at<=qty).map(s=>s.kind+'.'+s.level+'.'+s.basis).join(',')+'|remaining:'+remaining
}
