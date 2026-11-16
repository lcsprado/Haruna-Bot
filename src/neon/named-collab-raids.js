// Registry for named collaboration raids. Internal numeric levels are storage keys,
// never offered as the public command or as player level requirements.
import {collabRaidBrazilDay,collabRaidEligible} from './collab-fragment-rules.js'
export const BLEACH_RAID_ID=76
export const BLEACH_FRAGMENT_ITEM='fragmento_reiatsu_bleach'
export const BLEACH_KEY_ITEM='chave_raid_bleach'
export const BLEACH_FRAGMENTS_PER_WIN=8
export const BLEACH_FRAGMENTS_DAILY_CAP=48
export const NAMED_COLLAB_RAIDS=Object.freeze([
 Object.freeze({
  level:BLEACH_RAID_ID,slug:'bleach',name:'Bleach — Aizen, Hōgyoku',
  minLevel:70,hp:1350000,atk:280,keyId:BLEACH_KEY_ITEM,keyPrice:480000,
  cashPool:720000,xpPool:29000,petXpPool:2800,
  material:Object.freeze({id:BLEACH_FRAGMENT_ITEM,name:'Fragmento de Reiatsu — Bleach'}),
  box:null,gear:null,gearChance:0,durationMinutes:40,
  // Requires 3 automatic stages, no extra commands or phase instances.
  phases:Object.freeze([
   Object.freeze({index:1,name:'Kyōka Suigetsu',threshold:1,attackMultiplier:1,specialChance:.22,specialName:'Hipnose Absoluta'}),
   Object.freeze({index:2,name:'Despertar do Hōgyoku',threshold:.66,attackMultiplier:1.10,specialChance:.27,specialName:'Colapso Espiritual'}),
   Object.freeze({index:3,name:'Transcendência de Aizen',threshold:.33,attackMultiplier:1.20,specialChance:.32,specialName:'Ruptura do Reiatsu'})
  ])
 })
])
const byName=new Map(NAMED_COLLAB_RAIDS.map(cfg=>[cfg.slug,cfg]))
export function namedCollabRaid(value){
 const key=String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 return byName.get(key)||null
}
export function raidSelection(value,regularCatalog=[]){
 const named=namedCollabRaid(value)
 if(named)return named.level
 const raw=String(value||'').trim().toLowerCase()
 if(!raw)return 0
 const alias=['pecados','7pecados','setepecados','collab'].includes(raw)?75:raw
 if(!/^\d+$/.test(String(alias)))return 0
 const n=Number(alias)
 // Numeric selectors retain existing normal raid indexing. Collabs use names ONLY.
 const regular=regularCatalog.filter(cfg=>!cfg.slug)
 if(regular.some(cfg=>Number(cfg.level)===n))return n
 if(n>=1&&n<=regular.length)return Number(regular[n-1].level)
 return 0
}
export function raidPublicName(raid){
 const cfg=raid||{}
 return cfg.slug?'Raid '+String(cfg.slug).charAt(0).toUpperCase()+String(cfg.slug).slice(1):
  'Raid Lv.'+String(cfg.level)
}
export function raidPublicArg(raid){return raid?.slug||String(raid?.level||'')}
export function raidPhase(cfg,hp,maxHp){
 if(!cfg?.slug||!Array.isArray(cfg.phases)||!cfg.phases.length)return null
 const full=Math.max(1,Number(maxHp)||1)
 const fraction=Math.min(1,Math.max(0,Number(hp)/full))
 let selected=cfg.phases[0]
 for(const stage of cfg.phases)if(fraction<=stage.threshold)selected=stage
 return selected
}
export function bleachRaidFragmentCredit({dayEarned=0,damage=0,share=0}={}){
 const prior=Number(dayEarned)
 if(!Number.isSafeInteger(prior)||prior<0)throw new RangeError('Invalid daily material balance')
 if(!collabRaidEligible(damage,share))return 0
 return Math.max(0,Math.min(BLEACH_FRAGMENTS_PER_WIN,BLEACH_FRAGMENTS_DAILY_CAP-prior))
}
export const bleachRaidDailyKey=(jid,nowMs=Date.now())=>
 'bleach_raid_fragments_daily:'+collabRaidBrazilDay(nowMs)+':'+jid
