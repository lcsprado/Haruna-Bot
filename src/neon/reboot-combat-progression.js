// V2: progressão compartilhada entre WhatsApp e Web. Sem novos serviços/tabelas.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export const V2_XP_FULL_DAILY=8000
export const V2_XP_MAX_DAILY=12000
export const V2_XP_EXTRA_RATE=.25
export function brazilProgressionDay(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
 const p=Object.fromEntries(parts.map(({type,value})=>[type,value]))
 return p.year+'-'+p.month+'-'+p.day
}
// Leitura pura para perfil: não cria registro nem reinicia a quota no banco.
export function v2DailyXpStatus(state,{day=brazilProgressionDay()}={}){
 const used=state?.day===day?Number(state.used):0
 if(!Number.isSafeInteger(used)||used<0)throw Error('Saldo de XP diário inválido')
 const fullRemaining=Math.max(0,V2_XP_FULL_DAILY-used)
 const remaining=Math.max(0,V2_XP_MAX_DAILY-used)
 return {day,used,fullRemaining,remaining,cap:V2_XP_MAX_DAILY,
  rate:remaining===0?0:fullRemaining>0?1:V2_XP_EXTRA_RATE}
}
export function v2XpCredit(used,base,bonus=0){
 for(const v of [used,base,bonus])if(!Number.isSafeInteger(v)||v<0)throw Error('Saldo de XP diário inválido')
 const full=Math.max(0,V2_XP_FULL_DAILY-used)
 const room=Math.max(0,V2_XP_MAX_DAILY-used)
 const fullBase=Math.min(base,full)
 const creditedBase=Math.min(room,fullBase+Math.floor((base-fullBase)*V2_XP_EXTRA_RATE))
 // O bônus de consumível usa a mesma faixa diária, e somente XP efetivamente
 // creditado é debitado de seu saldo. Sem exceção por modalidade de jogo.
 const remainingFull=Math.max(0,full-creditedBase)
 const fullBonus=Math.min(bonus,remainingFull)
 const creditedBonus=Math.min(Math.max(0,room-creditedBase),fullBonus+Math.floor((bonus-fullBonus)*V2_XP_EXTRA_RATE))
 return {base:creditedBase,bonus:creditedBonus,awarded:creditedBase+creditedBonus,used:used+creditedBase+creditedBonus,cap:V2_XP_MAX_DAILY}
}
export async function reserveV2DailyXp(client,jid,base,bonus,{day=brazilProgressionDay()}={}){
 // Chamador mantém SELECT users FOR UPDATE, dentro da transação de EXP.
 // Um registro por jogador, reaproveitado a cada dia (sem crescimento diário).
 const key='reboot_xp_daily:'+jid
 const old=(await client.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value
 const used=old?.day===day?Number(old.used):0
 const out=v2XpCredit(used,base,bonus)
 if(out.awarded>0)await client.query("INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",[key,JSON.stringify({day,used:out.used})])
 return {...out,day}
}
export const V2_CLASS_GROWTH=Object.freeze({
 paladin:Object.freeze({hp:360,atk:0,def:40,spd:0}),
 berserker:Object.freeze({hp:170,atk:45,def:8,spd:4}),
 samurai:Object.freeze({hp:210,atk:32,def:12,spd:24}),
 necromancer:Object.freeze({hp:240,atk:25,def:18,spd:6})
})
export const V2_PVP_ROLES=Object.freeze({
 paladin:Object.freeze({attack:.08,defense:.12}),
 berserker:Object.freeze({attack:.16,defense:.07}),
 samurai:Object.freeze({attack:.13,defense:.07}),
 necromancer:Object.freeze({attack:.12,defense:.09})
})
export const V2_AWAKENING=Object.freeze({
 2:{level:25,cost:12000,mult:2,raidMin:15},
 3:{level:50,cost:30000,mult:3,raidMin:30},
 4:{level:75,cost:65000,mult:4,raidMin:50},
 5:{level:100,cost:120000,mult:5,raidMin:60}
})
export function effectiveAwakeningTier(tier,{enabled=classesOnlyRebootEnabled()}={}){
 if(!tier||!enabled)return tier
 return {...tier,...V2_AWAKENING[tier.stage]}
}
// Dificuldade de entrada mais acessível sem trivializar as Raids finais.
// A duração e cadência original de 8s permanecem.
export const V2_RAID_DIFFICULTY=Object.freeze({
 10:{hp:9500,atk:12},15:{hp:18000,atk:20},20:{hp:30000,atk:30},
 25:{hp:47000,atk:40},30:{hp:75000,atk:52},40:{hp:145000,atk:75},
 50:{hp:270000,atk:108},60:{hp:420000,atk:135},65:{hp:560000,atk:165},
 70:{hp:1600000,atk:320}
})
