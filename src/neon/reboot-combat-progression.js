// V2: progresso compartilhado entre WhatsApp e Web; sem limite diario de XP.
// No horario de Brasilia (America/Sao_Paulo), XP manual/normal:
// 00:00–05:59:59 = 70%; 06:00–23:59:59 = 100%.
// RaidLote ja recebe 60% no motor de Raids: nunca reduzir novamente.
// Apenas XP do jogador; XP dos pets, drops e economia permanecem intactos.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js'
export const V2_XP_NIGHT_RATE=.70
export const V2_XP_DAY_RATE=1
export function brazilProgressionDay(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
 const p=Object.fromEntries(parts.map(({type,value})=>[type,value]))
 return p.year+'-'+p.month+'-'+p.day
}
export function v2HourlyXpRate(now=new Date()){
 const hour=Number(new Intl.DateTimeFormat('en-GB',{
  timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'
 }).format(now))
 if(!Number.isInteger(hour)||hour<0||hour>23)throw new Error('Horario de XP invalido')
 return hour<6?V2_XP_NIGHT_RATE:V2_XP_DAY_RATE
}
// Registro diario exclusivamente informativo: nao existe teto, bloqueio nem quota.
// A leitura nao cria registro; a mesma chave e reutilizada ao mudar o dia.
export function v2DailyXpStatus(state,{now=new Date(),day=brazilProgressionDay(now)}={}){
 const used=state?.day===day?Number(state.used):0
 if(!Number.isSafeInteger(used)||used<0)throw Error('Saldo de XP diario invalido')
 const rate=v2HourlyXpRate(now)
 return {day,used,cap:null,fullRemaining:null,remaining:null,rate,unlimited:true}
}
export function v2XpCredit(used,base,bonus=0,{now=new Date(),skipNightRate=false}={}){
 for(const v of [used,base,bonus])
  if(!Number.isSafeInteger(v)||v<0)throw Error('Saldo de XP diario invalido')
 const rate=skipNightRate?1:v2HourlyXpRate(now)
 // Inteiros exatos: evita Math.floor(360 * 0.7) retornar 251 por erro de float.
 const basisPoints=rate===V2_XP_NIGHT_RATE?7000n:10000n
 const creditedBase=Number((BigInt(base)*basisPoints)/10000n)
 const creditedBonus=Number((BigInt(bonus)*basisPoints)/10000n)
 const awarded=creditedBase+creditedBonus
 const total=used+awarded
 if(!Number.isSafeInteger(total))throw Error('Saldo de XP diario invalido')
 return {base:creditedBase,bonus:creditedBonus,awarded,used:total,cap:null,rate}
}
export async function reserveV2DailyXp(client,jid,base,bonus,{
 now=new Date(),day=brazilProgressionDay(now),skipNightRate=false
}={}){
 // O chamador segura SELECT users FOR UPDATE na mesma transacao.
 // Um unico registro reutilizado por jogador, sem crescimento diario de tabelas.
 const key='reboot_xp_daily:'+jid
 const old=(await client.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value
 const used=old?.day===day?Number(old.used):0
 const out=v2XpCredit(used,base,bonus,{now,skipNightRate})
 if(out.awarded>0)await client.query(
  "INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",
  [key,JSON.stringify({day,used:out.used})]
 )
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

// Apenas PvP V2. O Despertar V e as passivas PvE permanecem intactos.
export function v2PvpDamageAdjustment(damage,classId,awakeningStage,applied=true,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled||!applied||awakeningStage>=5||damage<=0)return damage
 const factor=classId==='samurai'?.975:classId==='necromancer'&&awakeningStage<=1?1.02:classId==='paladin'&&awakeningStage>=2?1.02:1
 return Math.max(1,Math.round(damage*factor))
}
// Proteção simétrica: antes do nível 21 não pode iniciar nem receber PvP.
export function assertV2PvpAccess(attackerLevel,defenderLevel,{enabled=classesOnlyRebootEnabled()}={}){
 if(!enabled)return true
 for(const level of [attackerLevel,defenderLevel])if(!Number.isSafeInteger(Number(level))||Number(level)<21)
   throw Error('🛡️ PROTEÇÃO DE INICIANTE: ambos os jogadores precisam estar no Lv.21 ou superior para participar do PvP.')
 return true
}
