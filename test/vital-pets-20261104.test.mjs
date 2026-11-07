import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {VITAL_PETS,VITAL_PET_SPECIES,resolveVitalTeam,VITAL_TEAM_BONUS,applyVitalCombatHp,restoreVitalPersistentHp,vitalPulseHeal} from '../src/neon/vital-pets.js'
import {PET_STATUS_SPECIALTIES,petCombatSpecialty,petPvpSpecialty} from '../src/neon/game-catalog.js'

const dbSource=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const gameSource=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const profileSource=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

test('Cinco lendários diferentes nas Raids existentes 40, 50, 60, 65 e 70',()=>{
  assert.deepEqual(VITAL_PETS.map(p=>p.raidLevel),[40,50,60,65,70])
  assert.equal(new Set(VITAL_PETS.map(p=>p.materialId)).size,5)
  assert.equal(new Set(VITAL_PET_SPECIES).size,5)
  for(const p of VITAL_PETS){
    const spec=PET_STATUS_SPECIALTIES[p.species]
    assert.ok(spec?.raid,p.species)
    assert.ok(spec.stats.hp>=11 && spec.stats.hp<=14,p.species)
    assert.equal(p.chance,8)
    assert.ok(p.power>=300 && p.power<=440)
    assert.ok(dbSource.includes("species:'"+p.species+"'"))
    assert.ok(dbSource.includes("...Object.fromEntries(VITAL_PETS.map(p=>[p.species"))
  }
})

test('Todos os altares somam 100%, preservando cinco espécies anteriores',()=>{
  const start=dbSource.indexOf('export const LEGENDARY_PET_SUMMONS=[')
  const end=dbSource.indexOf('export async function raid50DragonGuaranteeStatus',start)
  assert.ok(start>0 && end>start)
  const catalog=dbSource.slice(start,end)
  for(const p of VITAL_PETS){
    const section=catalog.split("{materialId:'"+p.materialId+"'")[1]
    assert.ok(section,p.materialId)
    const altar=section.split(']}')[0]
    const chances=[...altar.matchAll(/chance:(\d+)/g)].map(x=>Number(x[1]))
    assert.equal(chances.length,6,p.materialId)
    assert.equal(chances.reduce((a,b)=>a+b,0),100,p.materialId)
    assert.ok(altar.includes("species:'"+p.species+"'"))
  }
})

test('Nível 100 mantém progressão de elite e efeitos alternativos de cada pet',()=>{
  for(const p of VITAL_PETS){
    const stats=petCombatSpecialty(p.species)
    assert.ok(stats.hp>=.11 && stats.hp<=.140001)
    assert.equal(stats.raid,true)
    const pvp=petPvpSpecialty(p.species,100)
    assert.ok(pvp.hp>=.03 && pvp.hp<=.045+1e-9,p.species)
    assert.ok(pvp.defense<=.045+1e-9)
    assert.ok(pvp.crit<=.045+1e-9)
    assert.ok(pvp.dodge<=.05+1e-9)
  }
  assert.ok(petCombatSpecialty('quimera_rubra').damage>petCombatSpecialty('fenix_caos').damage)
  assert.ok(petCombatSpecialty('serafim_vida_abissal').healPct>0)
  assert.ok(petCombatSpecialty('cervo_aurora_viva').healPct>0)
  assert.ok(petCombatSpecialty('leviata_eternidade').bossDamage>0)
  assert.equal(petPvpSpecialty('fenix_eclipse',100).hp,0)
})

test('Sinergia exige três espécies exclusivas, sem Coringas e sem cópias',()=>{
  assert.equal(resolveVitalTeam(VITAL_PET_SPECIES.slice(0,3)),VITAL_TEAM_BONUS)
  assert.equal(resolveVitalTeam([VITAL_PET_SPECIES[0],VITAL_PET_SPECIES[0],VITAL_PET_SPECIES[1]]),null)
  assert.equal(resolveVitalTeam([VITAL_PET_SPECIES[0],VITAL_PET_SPECIES[1],'guaxinim_errante_20261027']),null)
  assert.equal(resolveVitalTeam([VITAL_PET_SPECIES[0],VITAL_PET_SPECIES[1],'fenix_eclipse']),null)
  assert.equal(resolveVitalTeam(VITAL_PET_SPECIES.slice(0,2)),null)
  assert.equal(VITAL_TEAM_BONUS.hp,.08)
  assert.equal(VITAL_TEAM_BONUS.defense,.02)
  assert.equal(VITAL_TEAM_BONUS.vitalPulse,.05)
  assert.equal(VITAL_TEAM_BONUS.attack,0)
  assert.equal(VITAL_TEAM_BONUS.crit,0)
})

test('Vínculo Vital se conecta ao motor antigo sem duplicar outros bônus',()=>{
  const first=dbSource.indexOf('export function petTeamSynergy(pets=[]){')
  const last=dbSource.indexOf('export const LEGENDARY_PET_SUMMONS=[',first)
  assert.ok(first>0 && last>first)
  const js=dbSource.slice(first,last).replace('export function petTeamSynergy','function petTeamSynergy')
  const fn=runInNewContext(js+'\npetTeamSynergy',{
    PECADOS_HERO_IDS:[],
    resolveVitalTeam,
    resolveCollabWildcardTeam:()=>null,
    resolveAstralLynxWildcard:()=>null,
    PET_COLLAB_TEAM_GROUPS:[],
    PET_TEAM_WILDCARD_BONUS:{},
    PET_TEAM_STYLE_BONUS:{},
    resolveBatTeamStyles:species=>species.map(()=>null)
  })
  const s=fn(VITAL_PET_SPECIES.slice(0,3).map(species=>({species})))
  assert.equal(s.hp,.08)
  assert.equal(s.vitalPulse,.05)
  assert.equal(s.defense,.02)
  assert.equal(s.attack,0)
  assert.equal(s.collabAttack,0)
  assert.equal(s.collabCrit,0)
  assert.equal(fn([VITAL_PET_SPECIES[0],VITAL_PET_SPECIES[0],VITAL_PET_SPECIES[1]].map(species=>({species}))),null)
})

test('HP temporal respeita limite, escala vida proporcional e não cria cura',()=>{
  const base=applyVitalCombatHp(3000,6000,.14,.08)
  assert.equal(base.maxHp,7320)
  assert.equal(base.hp,3660)
  assert.equal(restoreVitalPersistentHp(base.hp,base.maxHp,6000),3000)
  const pvp=applyVitalCombatHp(3000,6000,.045,.08,{pvp:true})
  assert.equal(pvp.maxHp,6510)
  assert.equal(pvp.hp,3255)
  assert.equal(restoreVitalPersistentHp(pvp.hp,pvp.maxHp,6000),3000)
  const capped=applyVitalCombatHp(6000,6000,.30,.08)
  assert.equal(capped.rate,.32)
  assert.equal(capped.maxHp,7920)
  assert.equal(applyVitalCombatHp(0,6000,.14,.08).hp,0)
  assert.ok(restoreVitalPersistentHp(100000,7320,6000)<=6000)
})

test('Coração Eterno cura somente uma vez, apenas se vivo e abaixo de 35%',()=>{
  assert.equal(vitalPulseHeal(1500,6000,false,.05).heal,300)
  assert.equal(vitalPulseHeal(1500,6000,true,.05).heal,0)
  assert.equal(vitalPulseHeal(0,6000,false,.05).heal,0)
  assert.equal(vitalPulseHeal(5000,6000,false,.05).heal,0)
  assert.equal(vitalPulseHeal(1500,6000,false,0).heal,0)
  assert.equal(vitalPulseHeal(1500,6000,false,.025).heal,150)
})

test('Regras de PvP, Boss, Raid, perfil e pets usam o bônus real, sem alterá-lo no banco',()=>{
  assert.match(dbSource,/applyPvpVital\(A,aSynergy\)/)
  assert.match(dbSource,/applyPvpVital\(B,bSynergy\)/)
  assert.match(dbSource,/vitalPulseHeal\(to.hp,to.maxHp/)
  assert.match(dbSource,/classPersistentHp\\(fighter.hp,fighter.maxHp,fighter.heroPersistentMaxHp\\)/)
  assert.match(gameSource,/vitalRaidOpening\(s.players\[jid\]\)/)
  assert.match(gameSource,/vitalPulseHeal\(p.hp,p.maxHp/)
  assert.match(gameSource,/vitalPulseHeal\(php,effectiveMaxHp/)
  assert.match(gameSource,/restoreVitalPersistentHp\(php,effectiveMaxHp/)
  assert.match(gameSource,/for\(const key of \['damage','defense','crit','dodge','hp'\]\)/)
  assert.match(profileSource,/petHpPvePct:vitalPve.rate\*100/)
  assert.match(profileSource,/petHpPvpPct:vitalPvp.rate\*100/)
})
