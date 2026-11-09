import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatHeroDailyXpReport} from '../src/neon/hero-daily-xp-report.js'
import {heroLevelAwardPolicy,heroMasteryAwardPolicy,sevenSinsProgressWeekActive} from '../src/neon/playable-heroes-core.js'

const date=s=>Date.parse(s)
const ban=(overrides={})=>({id:'pecado_ban',name:'Ban',owned:true,active:true,
  petLevel:100,petXp:9900,masteryXp:2040,masteryStage:3,...overrides})
const diane=(overrides={})=>({id:'pecado_diane',name:'Diane',owned:true,active:false,
  petLevel:50,petXp:4900,masteryXp:800,masteryStage:2,...overrides})
const now=date('2026-11-03T10:49:00-03:00')

test('!heroi xp mostra XP de maestria creditado hoje, limite, data e ultimo horario',()=>{
 const out=formatHeroDailyXpReport({heroes:[ban(),diane()],playerLevel:395,nowMs:now,awards:[
   {hero_species:'pecado_ban',kind:'maestria',gained:400,last_award:date('2026-11-03T09:15:00-03:00')/1000}
 ]})
 assert.match(out,/03\/11\/2026/)
 assert.match(out,/BAN.*ATIVO/)
 assert.match(out,/Nível hoje: \*0 XP\* • nível máximo/)
 assert.match(out,/Maestria hoje: \*400\/400 XP\* • faltam \*0 XP\*/)
 assert.match(out,/09:15/)
 assert.match(out,/DIANE/)
 assert.match(out,/Nível hoje: \*0\/550 XP\* • faltam \*550 XP\*/)
 assert.match(out,/Maestria hoje: \*0\/400 XP\* • faltam \*400 XP\*/)
 assert.match(out,/Seu herói ativo esgotou o XP disponível/)
 assert.match(out,/!heroi usar nome/)
 assert.match(out,/00h00 de Brasília/)
})

test('cota especial de maestria de 600 encerra em 03/11; 500 antigos nao geram saldo negativo',()=>{
 const hero=ban({petLevel:80,petXp:7900,masteryXp:2000})
 const awards=[{hero_species:'pecado_ban',kind:'maestria',gained:500,last_award:0}]
 const nov2=formatHeroDailyXpReport({heroes:[hero],awards,playerLevel:390,
   nowMs:date('2026-11-02T15:00:00-03:00')})
 assert.match(nov2,/500\/600 XP\* • faltam \*100 XP/)
 assert.match(nov2,/depende da Raid 75 especial/)
 const nov3=formatHeroDailyXpReport({heroes:[hero],awards,playerLevel:390,nowMs:now})
 assert.match(nov3,/500\/400 XP\* • faltam \*0 XP/)
 assert.doesNotMatch(nov3,/faltam \*-\d/)
})

test('semana da ascensao muda teto de nivel somente para jogador abaixo de 300 e heroi abaixo de 70',()=>{
 const h=diane()
 const novice=formatHeroDailyXpReport({heroes:[h],awards:[
   {hero_species:'pecado_diane',kind:'nivel',gained:300}
 ],playerLevel:299,nowMs:now})
 assert.match(novice,/300\/1\.000 XP\* • faltam \*700 XP/)
 const veteran=formatHeroDailyXpReport({heroes:[h],awards:[
   {hero_species:'pecado_diane',kind:'nivel',gained:300}
 ],playerLevel:300,nowMs:now})
 assert.match(veteran,/300\/550 XP\* • faltam \*250 XP/)
})

test('maestria total em 7000 e nivel 100 nao oferecem XP adicional',()=>{
 const out=formatHeroDailyXpReport({heroes:[ban({masteryXp:7000,masteryStage:5})],nowMs:now})
 assert.match(out,/XP máximo/)
 assert.match(out,/Sem XP adicional para farmar hoje/)
})

test('jogadores sem herois veem orientacao e nunca a colecao de terceiros',()=>{
 const out=formatHeroDailyXpReport({heroes:[ban({owned:false})],awards:[],nowMs:now})
 assert.match(out,/não possui heróis/)
})

test('comando usa tabelas de awards e data de Sao Paulo, sem alterar progressao',()=>{
 const src=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8')
 assert.match(src,/if\(action==='xp'\)/)
 assert.match(src,/getPlayableHeroDailyXp\(sender,selected\?\.species\|\|null\)/)
 assert.match(src,/FROM hero_level_awards/)
 assert.match(src,/FROM hero_mastery_awards/)
 assert.match(src,/TIME ZONE 'America\/Sao_Paulo'/)
 assert.match(src,/if\(heroId&&!heroes\.length\)/)
})

test('09-15/11 libera as cotas diarias de nivel e maestria e restaura em 16/11',()=>{
 const start=date('2026-11-09T00:00:00-03:00')
 const close=date('2026-11-16T00:00:00-03:00')
 assert.equal(sevenSinsProgressWeekActive(start-1),false)
 assert.equal(sevenSinsProgressWeekActive(start),true)
 assert.equal(sevenSinsProgressWeekActive(close-1),true)
 assert.equal(sevenSinsProgressWeekActive(close),false)
 const mastery={earnedToday:400,regularEarnedToday:400,xp:90}
 const level={earnedToday:550,currentXp:5000,xp:125,playerLevel:400,heroLevel:51}
 assert.equal(heroMasteryAwardPolicy({...mastery,nowMs:start-1}).amount,0)
 assert.equal(heroMasteryAwardPolicy({...mastery,nowMs:start}).amount,90)
 assert.equal(heroMasteryAwardPolicy({...mastery,nowMs:start}).dailyCap,null)
 assert.equal(heroMasteryAwardPolicy({...mastery,nowMs:close}).amount,0)
 assert.equal(heroLevelAwardPolicy({...level,nowMs:start-1}).amount,0)
 assert.equal(heroLevelAwardPolicy({...level,nowMs:start}).amount,125)
 assert.equal(heroLevelAwardPolicy({...level,nowMs:start}).dailyCap,null)
 assert.equal(heroLevelAwardPolicy({...level,nowMs:close}).amount,0)
 assert.equal(heroLevelAwardPolicy({...level,currentXp:9900,nowMs:start}).amount,0)
})
test('!heroi xp mostra sem limite durante a semana e os tetos totais permanecem',()=>{
 const on=date('2026-11-10T12:00:00-03:00')
 const hero=diane({active:true,petLevel:51,petXp:5000,masteryXp:2100,masteryStage:3})
 const awards=[
  {hero_species:hero.id,kind:'nivel',gained:700},
  {hero_species:hero.id,kind:'maestria',gained:500}
 ]
 const output=formatHeroDailyXpReport({heroes:[hero],awards,playerLevel:400,nowMs:on})
 assert.match(output,/Nível hoje: \*700 XP\* • sem limite diário/)
 assert.match(output,/Maestria hoje: \*500 XP\* • sem limite diário/)
 assert.match(output,/Limites diários normais voltam em 16\/11/)
 assert.doesNotMatch(output,/Sem XP adicional para farmar hoje/)
 const after=formatHeroDailyXpReport({heroes:[hero],awards,playerLevel:400,nowMs:date('2026-11-16T00:00:00-03:00')})
 assert.match(after,/Maestria hoje: \*500\/400 XP\*/)
 assert.match(after,/Nível hoje: \*700\/550 XP\*/)
})
